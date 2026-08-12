import { ApiProperty } from '@nestjs/swagger';

export class ErrorResponseDto {
  @ApiProperty({ example: 400 })
  statusCode!: number;

  @ApiProperty({ type: String, example: 'Bad Request' })
  error!: string;

  @ApiProperty({ example: 'phoneNumber은 필수입니다' })
  message!: string | string[];

  @ApiProperty({ example: '2026-08-04T10:00:00.000Z' })
  timestamp!: string;

  @ApiProperty({ example: '/auth/signup' })
  path!: string;

  @ApiProperty({ example: 'phoneNumber은 필수입니다' })
  detail!: string | string[];
}
