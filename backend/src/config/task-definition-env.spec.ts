import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getRequiredEnvKeys, listKnownEnvKeys } from './env.registry';

/**
 * R17: 운영 ECS task definition에 production 필수 env가 빠지지 않도록 막는다.
 *
 * OCTOMO_API_KEY 누락으로 `/health/ready`가 항상 not-ready가 되고 신규 가입·
 * 신규 디바이스 로그인이 전부 막히는 사고가 있었다. registry의
 * `requiredIn: ['production']`과 task definition의 `environment ∪ secrets`를
 * 대조해 같은 종류의 누락을 CI에서 차단한다.
 */

const ECS_DIR = join(__dirname, '..', '..', 'docker', 'ecs');

/** 새 task definition을 추가하면 여기에 등록해 unknown key·비-root 검사를 함께 받는다. */
const TASK_DEFINITION_FILES = [
  'backend-task-definition.json',
  'worker-task-definition.json',
  'inference-task-definition.json',
  'migrate-task-definition.json',
];

interface ContainerDefinition {
  name: string;
  environment?: Array<{ name: string; value: string }>;
  secrets?: Array<{ name: string; valueFrom: string }>;
  user?: string;
}

function readTaskDefinition(file: string): {
  containerDefinitions: ContainerDefinition[];
} {
  return JSON.parse(readFileSync(join(ECS_DIR, file), 'utf8')) as {
    containerDefinitions: ContainerDefinition[];
  };
}

function providedKeys(container: ContainerDefinition): Set<string> {
  return new Set([
    ...(container.environment ?? []).map((e) => e.name),
    ...(container.secrets ?? []).map((s) => s.name),
  ]);
}

describe('ECS task definition ↔ env registry (R17)', () => {
  // 컨테이너가 아니라 태스크 실행 환경이 주는 값들.
  // NODE_ENV는 task definition에 명시되어 있어야 하지만, 나머지는 아래에서 검증한다.
  const backend = readTaskDefinition('backend-task-definition.json');
  const backendContainer = backend.containerDefinitions.find(
    (c) => c.name === 'backend',
  );

  it('backend 컨테이너 정의가 존재한다', () => {
    expect(backendContainer).toBeDefined();
  });

  it('production 필수 env가 environment ∪ secrets에 모두 있다', () => {
    const provided = providedKeys(backendContainer!);
    const missing = getRequiredEnvKeys('production').filter(
      (key) => !provided.has(key),
    );
    expect(missing).toEqual([]);
  });

  it('OCTOMO 설정이 명시되어 있다 (키는 secret, 나머지는 environment)', () => {
    const secrets = new Set(
      (backendContainer!.secrets ?? []).map((s) => s.name),
    );
    const environment = new Set(
      (backendContainer!.environment ?? []).map((e) => e.name),
    );
    expect(secrets.has('OCTOMO_API_KEY')).toBe(true);
    expect(environment.has('OCTOMO_ENDPOINT')).toBe(true);
    expect(environment.has('OCTOMO_RECIPIENT_NUMBER')).toBe(true);
  });

  describe('worker task definition (R13)', () => {
    const worker = readTaskDefinition('worker-task-definition.json');
    const workerContainer = worker.containerDefinitions.find((c) => c.name === 'worker');

    it('worker 컨테이너 정의가 존재한다', () => {
      expect(workerContainer).toBeDefined();
    });

    it('production 필수 env가 모두 있다 — 워커도 같은 코드베이스를 부팅한다', () => {
      const provided = providedKeys(workerContainer!);
      const missing = getRequiredEnvKeys('production').filter((key) => !provided.has(key));
      expect(missing).toEqual([]);
    });

    it('JOB_ROLE=worker이고 BullMQ를 강제한다 (Redis 누락 시 조용히 inline으로 떨어지지 않게)', () => {
      const env = new Map(
        (workerContainer!.environment ?? []).map((e) => [e.name, e.value]),
      );
      expect(env.get('JOB_ROLE')).toBe('worker');
      expect(env.get('JOB_DISPATCHER')).toBe('bullmq');
    });

    it('API task definition은 워커 전환 전까지 both를 유지한다 (잡 유실 방지)', () => {
      const env = new Map(
        (backendContainer!.environment ?? []).map((e) => [e.name, e.value]),
      );
      // JOB_ROLE 미지정 = both. api로 내리는 것은 worker 서비스 가동 확인 후 별도 변경.
      expect(env.get('JOB_ROLE') ?? 'both').not.toBe('api');
    });
  });

  it('registry에 없는 unknown env key를 쓰지 않는다', () => {
    // inference-service(FastAPI)는 NestJS env registry를 공유하지 않으므로
    // 그 쪽 전용 키만 예외로 둔다.
    const known = new Set([
      ...listKnownEnvKeys(),
      'INFERENCE_CONCURRENCY',
      'INFERENCE_QUEUE_TIMEOUT_SECONDS',
    ]);

    for (const file of TASK_DEFINITION_FILES) {
      for (const container of readTaskDefinition(file).containerDefinitions) {
        for (const key of providedKeys(container)) {
          expect(known.has(key)).toBe(true);
        }
      }
    }
  });

  it('R19: 모든 컨테이너가 비-root(uid 10001)로 실행된다', () => {
    for (const file of TASK_DEFINITION_FILES) {
      for (const container of readTaskDefinition(file).containerDefinitions) {
        expect(container.user).toBe('10001');
      }
    }
  });
});
