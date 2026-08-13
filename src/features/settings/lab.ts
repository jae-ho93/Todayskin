import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * F79: 실험실(베타) 기능 플래그 — AI 상세 리포트(여드름·질환 분류) 노출 여부.
 *
 * 질환 분류는 의료기기 오인 소지가 있는 규제 경계 기능이다(D-02, Fable5 리뷰 15장).
 * 그래서 기본값은 숨김이고, 사용자가 설정 > 실험실에서 명시적으로 켠 경우에만
 * 결과 화면에 노출한다. 서버 계약은 그대로 두고(필드는 항상 내려옴) 표시만 게이트한다.
 */
const LAB_REPORT_KEY = 'todayskin.lab.aiDetailReport.v1';

export async function getLabReportEnabled(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(LAB_REPORT_KEY)) === 'true';
  } catch {
    // 저장소를 읽지 못하면 안전한 쪽(숨김)으로 간다.
    return false;
  }
}

/** 저장 성공 여부를 돌려준다 — 실패 시 호출부가 토글을 롤백한다. */
export async function setLabReportEnabled(enabled: boolean): Promise<boolean> {
  try {
    if (enabled) {
      await AsyncStorage.setItem(LAB_REPORT_KEY, 'true');
    } else {
      await AsyncStorage.removeItem(LAB_REPORT_KEY);
    }
    return true;
  } catch {
    return false;
  }
}
