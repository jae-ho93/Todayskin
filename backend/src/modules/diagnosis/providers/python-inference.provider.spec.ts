import { PythonInferenceProvider } from './python-inference.provider';
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

    // acneReport/diseaseClassification: inference-service 응답에 없으면 null로 채워진다.
    expect(result).toEqual({ ...validResponse, acneReport: null, diseaseClassification: null });
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
});
