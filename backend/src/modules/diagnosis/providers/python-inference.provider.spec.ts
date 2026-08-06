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
    parts: [
      { part: 'forehead', label: '이마', grade: '보통', moisture: 63.6, elasticity: 59.6, note: null },
    ],
  };

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('정상 응답을 InferenceResult로 반환', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => validResponse,
    }) as unknown as typeof fetch;

    const provider = new PythonInferenceProvider('http://127.0.0.1:8000');
    const result = await provider.infer(images);

    expect(result).toEqual(validResponse);
    expect(global.fetch).toHaveBeenCalledWith(
      'http://127.0.0.1:8000/infer',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('HTTP 오류 응답 시 예외', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 422,
      text: async () => '얼굴을 인식할 수 없습니다',
    }) as unknown as typeof fetch;

    const provider = new PythonInferenceProvider('http://127.0.0.1:8000');
    await expect(provider.infer(images)).rejects.toThrow(/HTTP 422/);
  });

  it('네트워크 오류 시 예외', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('ECONNREFUSED')) as unknown as typeof fetch;

    const provider = new PythonInferenceProvider('http://127.0.0.1:8000');
    await expect(provider.infer(images)).rejects.toThrow(/ECONNREFUSED/);
  });

  it('응답 형식이 계약과 다르면 예외', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ unexpected: true }),
    }) as unknown as typeof fetch;

    const provider = new PythonInferenceProvider('http://127.0.0.1:8000');
    await expect(provider.infer(images)).rejects.toThrow(/Unexpected inference service response/);
  });
});
