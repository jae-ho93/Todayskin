import { useCallback, useRef, useState } from 'react';
import { api } from '../../api/client';
import type { ConsentPurpose, ConsentPurposeInfo, ConsentRecord } from '../../types';

interface ConsentsData {
  /** 서버가 정의한 전체 동의 항목 — 아직 동의한 적 없는 항목도 여기 있다 */
  registry: ConsentPurposeInfo[] | null;
  /** 내가 남긴 동의 기록 */
  records: ConsentRecord[] | null;
}

export type ConsentsState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; data: ConsentsData };

/** `busy`는 다른 항목이 처리 중이어서 아무 것도 하지 않았다는 뜻이다. */
export type SetAgreementResult = 'ok' | 'busy' | 'failed';

/**
 * R27: 설정 화면의 동의 모달 상태.
 *
 * registry와 내 기록을 따로 들고 있으면 "둘 다 못 불러옴"(실패)과 "동의한 게 없음"(빈 목록)을
 * 화면에서 매번 다시 판단해야 한다. 여기서 한 번만 판단해 넘긴다.
 */
export function useConsents() {
  const [state, setState] = useState<ConsentsState>({ status: 'idle' });
  const [revokingPurpose, setRevokingPurpose] = useState<ConsentPurpose | null>(null);
  // registry는 사용자와 무관한 정적 목록이라 한 번 받으면 다시 받지 않는다.
  const registryRef = useRef<ConsentPurposeInfo[] | null>(null);

  const load = useCallback(async () => {
    setState({ status: 'loading' });

    if (!registryRef.current) {
      const result = await api.getConsentRegistry();
      registryRef.current = result.status === 'ok' ? result.data : null;
    }
    const records = await api.getMyConsents();

    setState({ status: 'ready', data: { registry: registryRef.current, records } });
  }, []);

  /**
   * 동의 상태 변경 후 목록을 다시 읽는다. 결과를 돌려줘 화면이 토스트를 고른다.
   * `busy`는 다른 항목이 처리 중이라 무시했다는 뜻 — 실패가 아니므로 화면은 조용히 넘긴다.
   */
  const setAgreement = useCallback(
    async (purpose: ConsentPurpose, agreed: boolean): Promise<SetAgreementResult> => {
      if (revokingPurpose) return 'busy';
      setRevokingPurpose(purpose);
      try {
        await api.upsertConsent(purpose, agreed);
        const records = await api.getMyConsents();
        setState((prev) =>
          prev.status === 'ready' ? { ...prev, data: { ...prev.data, records } } : prev,
        );
        return 'ok';
      } catch {
        return 'failed';
      } finally {
        setRevokingPurpose(null);
      }
    },
    [revokingPurpose],
  );

  return { state, revokingPurpose, load, setAgreement };
}
