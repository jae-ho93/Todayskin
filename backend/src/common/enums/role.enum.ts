/**
 * 사용자 권한 등급.
 * USER: 일반 회원. 자기 데이터만 조회/수정.
 * ADMIN: 운영자. 운영 전용 API 접근 가능.
 */
export enum Role {
  USER = 'USER',
  ADMIN = 'ADMIN',
}
