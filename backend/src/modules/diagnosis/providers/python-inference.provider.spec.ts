import {
  InferenceBusyError,
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

    expect(result).toEqual(validResponse);
    expect(global.fetch).toHaveBeenCalledWith(
      'http://127.0.0.1:8000/infer',
      expect.objectContaining({
        method: 'POST',
        // N13: 내부망 인증 shared secret이 X-Inference-Key로 전달된다.
        headers: expect.objectContaining({ 'x-inference-key': 'test-shared-secret' }),
      }),
    );
  });

  it('HTTP 오류 응답 시 예외', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 422,
      text: async () => '얼굴을 인식할 수 없습니다',
    }) as unknown as typeof fetch;

    const provider = new PythonInferenceProvider('http://127.0.0.1:8000', 'test-shared-secret');
    await expect(provider.infer(images)).rejects.toThrow(/HTTP 422/);
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
      await expect(provider.infer(images)).resolves.toEqual(validResponse);
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
