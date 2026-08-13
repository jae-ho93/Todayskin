import { useCallback, useEffect, useRef, useState } from 'react';
import { getLabReportEnabled, setLabReportEnabled } from './lab';

/**
 * F79: 실험실 토글 상태 (설정 화면용).
 * 로컬 저장소만 사용한다 — 규제 경계 기능의 노출 여부는 기기 단위 선택이면 충분하고,
 * 서버 저장을 붙이면 계약 변경(API freeze 위반)이 필요해진다.
 */
export type LabReportState =
  | { status: 'loading' }
  | { status: 'ready'; enabled: boolean; saveError: string | null };

const SAVE_FAILED = '실험실 설정 저장에 실패했어요';

export function useLabReport() {
  const [state, setState] = useState<LabReportState>({ status: 'loading' });
  const savingRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    void getLabReportEnabled().then((enabled) => {
      if (!cancelled) setState({ status: 'ready', enabled, saveError: null });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const setEnabled = useCallback(async (value: boolean) => {
    if (savingRef.current) return;
    savingRef.current = true;
    try {
      setState({ status: 'ready', enabled: value, saveError: null });
      const saved = await setLabReportEnabled(value);
      if (!saved) {
        // 저장 실패 시 롤백 — 화면과 저장소가 어긋난 채로 두지 않는다.
        setState({ status: 'ready', enabled: !value, saveError: SAVE_FAILED });
      }
    } finally {
      savingRef.current = false;
    }
  }, []);

  return { state, setEnabled };
}
