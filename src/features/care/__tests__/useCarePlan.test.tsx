import { api } from '../../../api/client';
import { flush, renderHook } from '../../../test-utils/renderHook';
import { useCarePlan } from '../useCarePlan';
import type { CarePlan, CarePlanFastResponse } from '../../../types';

/**
 * R27: useWeatherProducts/useHomeDashboard와 같은 fast-path 패턴을 케어 루틴에도
 * 그대로 적용했는지 확인한다. 특히 skin/combined의 "진단 없음 → empty"(에러 아님)
 * 구분과, refresh 플래그가 실제로 API에 전달되는지가 화면 분기의 근거다.
 */

jest.mock('../../../hooks/useUserLocation', () => ({
  useUserLocation: () => ({ coords: { latitude: 37.5, longitude: 127 }, permissionDenied: false, loading: false }),
}));

const carePlan: CarePlan = {
  careType: 'weather',
  routine: [
    { phase: '외출 전', step: '자외선 차단', ingredient: '징크옥사이드', amount: '한 마디', reason: '오늘 자외선이 높아요', evidence: null },
  ],
  products: [
    { name: '선크림', url: 'https://example.com/sunscreen', reason: '적합해요', category: '선크림', evidence: null },
  ],
  medicalDisclaimer: null,
};

function fastResponse(overrides: Partial<CarePlanFastResponse> = {}): CarePlanFastResponse {
  return { source: 'FALLBACK', plan: carePlan, ...overrides };
}

beforeEach(() => {
  jest.spyOn(api, 'getCareWeatherFast').mockResolvedValue(fastResponse());
  jest.spyOn(api, 'getCareSkinFast').mockResolvedValue(fastResponse());
  jest.spyOn(api, 'getCareCombinedFast').mockResolvedValue(fastResponse());
  jest.spyOn(api, 'getCareMorningFast').mockResolvedValue(fastResponse());
  jest.spyOn(api, 'waitForJob').mockResolvedValue(null);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('useCarePlan', () => {
  it('weather는 diagnosisId 없이 좌표만으로 요청한다', async () => {
    const { result } = renderHook(() => useCarePlan({ careType: 'weather' }));
    await flush();

    expect(api.getCareWeatherFast).toHaveBeenCalledWith({
      coords: { latitude: 37.5, longitude: 127 },
      refresh: undefined,
    });
    expect(result.current.state.status).toBe('success');
    expect(result.current.state.status === 'success' && result.current.state.data).toEqual(carePlan);
  });

  it('skin/combined는 diagnosisId가 없으면 empty이고 API를 부르지 않는다', async () => {
    const { result } = renderHook(() => useCarePlan({ careType: 'skin', diagnosisId: null }));
    await flush();

    expect(result.current.state.status).toBe('empty');
    expect(api.getCareSkinFast).not.toHaveBeenCalled();
  });

  it('skin은 diagnosisId가 있으면 그 진단 기준으로 요청한다', async () => {
    const { result } = renderHook(() => useCarePlan({ careType: 'skin', diagnosisId: 'diag-1' }));
    await flush();

    expect(api.getCareSkinFast).toHaveBeenCalledWith('diag-1', {
      refresh: undefined,
      routine: undefined,
      medicalDisclaimer: undefined,
    });
    expect(result.current.state.status).toBe('success');
  });

  it('combined도 diagnosisId 기준으로 요청한다', async () => {
    renderHook(() => useCarePlan({ careType: 'combined', diagnosisId: 'diag-1' }));
    await flush();

    expect(api.getCareCombinedFast).toHaveBeenCalledWith('diag-1', {
      refresh: undefined,
      routine: undefined,
      medicalDisclaimer: undefined,
    });
  });

  it('morning은 diagnosisId 없으면 empty이고, 있으면 진단+좌표 둘 다로 요청한다', async () => {
    const { result } = renderHook(() => useCarePlan({ careType: 'morning', diagnosisId: null }));
    await flush();
    expect(result.current.state.status).toBe('empty');
    expect(api.getCareMorningFast).not.toHaveBeenCalled();

    renderHook(() => useCarePlan({ careType: 'morning', diagnosisId: 'diag-1' }));
    await flush();
    expect(api.getCareMorningFast).toHaveBeenCalledWith('diag-1', {
      coords: { latitude: 37.5, longitude: 127 },
      refresh: undefined,
      routine: undefined,
      medicalDisclaimer: undefined,
    });
  });

  it('refresh()는 refresh=true로 다시 요청한다', async () => {
    const { result } = renderHook(() => useCarePlan({ careType: 'weather' }));
    await flush();

    await result.current.refresh();
    await flush();

    expect(api.getCareWeatherFast).toHaveBeenLastCalledWith({
      coords: { latitude: 37.5, longitude: 127 },
      refresh: true,
    });
  });

  it('API 실패 시 error 상태가 된다', async () => {
    jest.spyOn(api, 'getCareWeatherFast').mockResolvedValue(null);
    const { result } = renderHook(() => useCarePlan({ careType: 'weather' }));
    await flush();

    expect(result.current.state.status).toBe('error');
  });

  it('FALLBACK + jobId면 LIVE job 완료 후 더 나은 결과로 교체한다', async () => {
    const livePlan: CarePlan = { ...carePlan, medicalDisclaimer: '실제 생성 결과' };
    jest.spyOn(api, 'getCareWeatherFast').mockResolvedValue(fastResponse({ jobId: 'job-1' }));
    jest.spyOn(api, 'waitForJob').mockResolvedValue({
      id: 'job-1',
      status: 'COMPLETED',
      result: { plan: livePlan, source: 'LIVE' },
    } as never);

    const { result } = renderHook(() => useCarePlan({ careType: 'weather' }));
    await flush();
    await flush();

    expect(result.current.state.status).toBe('success');
    expect(result.current.state.status === 'success' && result.current.state.data.medicalDisclaimer).toBe(
      '실제 생성 결과',
    );
  });
});
