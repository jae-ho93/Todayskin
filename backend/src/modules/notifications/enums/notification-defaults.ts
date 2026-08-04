 /**
  * 알림 설정 기본값 (T11).
  *
  * 신규 사용자가 설정을 명시적으로 저장하기 전까지 적용되는 초기값.
  * 프론트(settings.tsx)의 로컬 기본값과 일치시킨다.
  *
  * - pushEnabled: 기본 false. 푸시 발송은 T11 범위 밖이므로 기본 비활성화.
  * - uvAlertEnabled: 기본 true. 자외선 경보는 핵심 가이드 정보.
  * - dustAlertEnabled: 기본 true. 미세먼지 경보 역시 핵심 가이드 정보.
  * - morningReminder: 기본 false. 아침 리마인더는 사용자가 명시적으로 켜도록.
  */
 export const NOTIFICATION_DEFAULTS = {
   pushEnabled: false,
   uvAlertEnabled: true,
   dustAlertEnabled: true,
   morningReminder: false,
 } as const;
 
 export type NotificationDefaults = typeof NOTIFICATION_DEFAULTS;
