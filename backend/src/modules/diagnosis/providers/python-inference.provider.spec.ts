import {
  InferenceBusyError,
  InferenceRejectedError,
  PythonInferenceProvider,
} from './python-inference.provider';
import { InferenceImages } from './inference-provider.interface';

/**
 * PythonInferenceProvider 단위 테스트.
 * inference-service(FastAPI)는 외부 프로세스이므로 global.fetch를 mock해서
 * 요청 forwarding과 응답 매핑/에러 처리만 검증한다.
 */
describe('PythonInferenceProvider', () => {
  const images: InferenceImages = {
    front: { buffer: Buffer.from([1, 2, 3]), mimetype: 'image/jpeg', size: 3 },
  };

  const validResponse = {
    overallScore: 74,
    modelVersion: 'mobilenet_v3_large-todayskin-v1',
    // N8: provider는 landmarks 필드를 항상 반환한다(값이 없으면 null).
    landmarks: null,
    parts: [
      { part: 'forehead', label: '이마', grade: '보통', moisture: 63.6, elasticity: 59.6, note: null },
    ],
  };

  // provider가 채워 넣는 선택 필드까지 포함한 최종 형태.
  // 응답에 acneReport/diseaseClassification이 없으면 null로 정규화된다.
  const normalizedResponse = {
    ...validResponse,
    acneReport: null,
    diseaseClassification: null,
  };

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('정상 응답을 InferenceResult로 반환 + N13 인증 헤더 전송', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => validResponse,
    }) as unknown as typeof fetch;

    const provider = new PythonInferenceProvider('http://127.0.0.1:8000', 'test-shared-secret');
    const result = await provider.infer(images);

    expect(result).toEqual(normalizedResponse);
    expect(global.fetch).toHaveBeenCalledWith(
      'http://127.0.0.1:8000/infer',
      expect.objectContaining({
        method: 'POST',
        // N13: 내부망 인증 shared secret이 X-Inference-Key로 전달된다.
        headers: expect.objectContaining({ 'x-inference-key': 'test-shared-secret' }),
      }),
    );
  });

  it('acneReport/diseaseClassification이 있으면 그대로 통과', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        ...validResponse,
        acneReport: '이마에 비염증성 여드름 1개가 있습니다.',
        diseaseClassification: { label: '정상', confidence: 0.98 },
      }),
    }) as unknown as typeof fetch;

    const provider = new PythonInferenceProvider('http://127.0.0.1:8000', 'test-shared-secret');
    const result = await provider.infer(images);

    expect(result.acneReport).toBe('이마에 비염증성 여드름 1개가 있습니다.');
    expect(result.diseaseClassification).toEqual({ label: '정상', confidence: 0.98 });
  });

  it('HTTP 오류 응답 시 예외', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => 'internal error',
    }) as unknown as typeof fetch;

    const provider = new PythonInferenceProvider('http://127.0.0.1:8000', 'test-shared-secret');
    await expect(provider.infer(images)).rejects.toThrow(/HTTP 500/);
  });

  // N49: 품질 게이트/얼굴 미인식(422) — 입력 문제로 구분해 던진다.
  describe('422 입력 거부 (N49)', () => {
    const rejected = (detail: unknown) => ({
      ok: false,
      status: 422,
      json: async () => ({ detail }),
    });

    it('구조화 detail({code, message})을 InferenceRejectedError로 변환한다', async () => {
      global.fetch = jest
        .fn()
        .mockResolvedValue(
          rejected({ code: 'TOO_DARK', message: '사진이 너무 어둡습니다' }),
        ) as unknown as typeof fetch;

      const provider = new PythonInferenceProvider('http://127.0.0.1:8000', 'secret');
      const error = await provider.infer(images).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(InferenceRejectedError);
      expect((error as InferenceRejectedError).code).toBe('TOO_DARK');
      expect((error as InferenceRejectedError).message).toContain('어둡');
    });

    it('문자열 detail(구버전 형식)도 기본 코드로 감싼다', async () => {
      global.fetch = jest
        .fn()
        .mockResolvedValue(rejected('얼굴을 인식할 수 없습니다')) as unknown as typeof fetch;

      const provider = new PythonInferenceProvider('http://127.0.0.1:8000', 'secret');
      const error = await provider.infer(images).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(InferenceRejectedError);
      expect((error as InferenceRejectedError).code).toBe('REJECTED');
      expect((error as InferenceRejectedError).message).toContain('얼굴');
    });

    it('body 파싱에 실패해도 기본 코드/메시지로 던진다', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 422,
        json: async () => {
          throw new Error('invalid json');
        },
      }) as unknown as typeof fetch;

      const provider = new PythonInferenceProvider('http://127.0.0.1:8000', 'secret');
      const error = await provider.infer(images).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(InferenceRejectedError);
      expect((error as InferenceRejectedError).code).toBe('REJECTED');
    });
  });

  it('네트워크 오류 시 예외', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('ECONNREFUSED')) as unknown as typeof fetch;

    const provider = new PythonInferenceProvider('http://127.0.0.1:8000', 'test-shared-secret');
    await expect(provider.infer(images)).rejects.toThrow(/ECONNREFUSED/);
  });

  it('응답 형식이 계약과 다르면 예외', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ unexpected: true }),
    }) as unknown as typeof fetch;

    const provider = new PythonInferenceProvider('http://127.0.0.1:8000', 'test-shared-secret');
    await expect(provider.infer(images)).rejects.toThrow(/Unexpected inference service response/);
  });

  // R6: 추론 슬롯 혼잡(429)
  describe('429 혼잡 처리', () => {
    const busy = {
      ok: false,
      status: 429,
      headers: { get: () => '1' },
      text: async () => '추론 서버가 혼잡합니다',
    };

    it('한 번 재시도해서 성공하면 정상 결과를 반환한다', async () => {
      global.fetch = jest
        .fn()
        .mockResolvedValueOnce(busy)
        .mockResolvedValueOnce({ ok: true, status: 200, json: async () => validResponse })
        .mockName('fetch') as unknown as typeof fetch;

      const provider = new PythonInferenceProvider('http://127.0.0.1:8000', 'secret');
      await expect(provider.infer(images)).resolves.toEqual(normalizedResponse);
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    it('재시도도 429면 InferenceBusyError — 무한 재시도하지 않는다', async () => {
      global.fetch = jest.fn().mockResolvedValue(busy) as unknown as typeof fetch;

      const provider = new PythonInferenceProvider('http://127.0.0.1:8000', 'secret');
      await expect(provider.infer(images)).rejects.toBeInstanceOf(InferenceBusyError);
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    it('Retry-After가 과도해도 대기 상한을 넘기지 않는다', async () => {
      global.fetch = jest
        .fn()
        .mockResolvedValueOnce({ ...busy, headers: { get: () => '600' } })
        .mockResolvedValueOnce({ ok: true, status: 200, json: async () => validResponse })
        .mockName('fetch') as unknown as typeof fetch;

      const provider = new PythonInferenceProvider('http://127.0.0.1:8000', 'secret');
      const startedAt = Date.now();
      await provider.infer(images);
      expect(Date.now() - startedAt).toBeLessThan(3000);
    });
  });
});
