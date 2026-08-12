import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { ConsentPurpose } from '../enums/consent-purpose.enum';

export class ConsentPurposeDto {
  @ApiProperty({ enum: ConsentPurpose })
  purpose!: ConsentPurpose;

  @ApiProperty()
  currentVersion!: string;

  @ApiProperty({ description: '기능 진입에 필수 여부' })
  required!: boolean;

  @ApiProperty()
  title!: string;

  @ApiProperty()
  description!: string;

  @ApiProperty({ enum: ['keep_results', 'delete_images'] })
  withdrawalPolicy!: 'keep_results' | 'delete_images';
}

export class ConsentRecordDto {
  @ApiProperty({ enum: ConsentPurpose })
  purpose!: ConsentPurpose;

  @ApiProperty()
  agreed!: boolean;

  @ApiProperty()
  version!: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  source?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  revokedAt?: string | null;

  @ApiProperty()
  createdAt!: string;

  @ApiProperty()
  updatedAt!: string;

  @ApiProperty({
    description: '현재 registry version과 일치하는 활성 동의인지',
  })
  active!: boolean;
}

export class UpsertConsentDto {
  @ApiProperty({ enum: ConsentPurpose })
  @IsEnum(ConsentPurpose)
  purpose!: ConsentPurpose;

  @ApiProperty({ description: '동의 여부. false면 철회로 처리' })
  @IsBoolean()
  agreed!: boolean;

  @ApiPropertyOptional({
    description: '생략 시 registry currentVersion을 사용',
  })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  version?: string;

  @ApiPropertyOptional({ enum: ['app', 'web', 'admin'] })
  @IsOptional()
  @IsIn(['app', 'web', 'admin'])
  source?: 'app' | 'web' | 'admin';
}
