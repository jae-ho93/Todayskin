import {
  Controller,
  Get,
  HttpCode,
  Post,
  Query,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
  BadRequestException,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { DiagnosisService } from './diagnosis.service';
import { SkinScoreSnapshotDto } from './dto/skin-score-snapshot.dto';
import { HistoryEntryDto } from './dto/history-entry.dto';
import { CursorPaginationQueryDto, CursorPageDto } from '../../common/pagination/cursor-pagination';
import { SubmitDiagnosisQueryDto } from './dto/submit-diagnosis-query.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../../common/strategies/jwt.strategy';
import { InferenceImage } from './providers/inference-provider.interface';
import { memoryStorage } from 'multer';

/**
 * 진단 multipart 필드 정의: 정면 1장.
 * 파일은 메모리에만 올리고 디스크에 저장하지 않는다(원본 이미지 비저장 원칙).
 */
const DIAGNOSIS_FILE_FIELDS = [{ name: 'front', maxCount: 1 }];

@ApiTags('diagnosis')
@Controller('diagnosis')
export class DiagnosisController {
  constructor(private readonly diagnosisService: DiagnosisService) {}

  @Get('latest')
  @ApiOperation({ summary: '가장 최근 진단 조회 (본인)' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  async getLatest(@CurrentUser() user: JwtPayload): Promise<SkinScoreSnapshotDto> {
    return this.diagnosisService.getLatest(user.sub);
  }

  @Get('history')
  @ApiOperation({ summary: '진단 이력 (본인, 최신순)' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  async getHistory(
    @CurrentUser() user: JwtPayload,
    @Query() query: CursorPaginationQueryDto,
  ): Promise<HistoryEntryDto[] | CursorPageDto<HistoryEntryDto>> {
    return this.diagnosisService.getHistory(user.sub, {
      limit: query.limit,
      cursor: query.cursor,
    });
  }

  @Post()
  @ApiOperation({ summary: '진단 제출 — 정면 1장 이미지 업로드' })
  @ApiBearerAuth()
  @ApiConsumes('multipart/form-data')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(
    FileFieldsInterceptor(DIAGNOSIS_FILE_FIELDS, {
      storage: memoryStorage(),
      // 파일 크기 상한은 서비스에서도 재검증하지만, multer 단에서도 막아 과도한 메모리 사용을 방지한다.
      limits: { fileSize: 10 * 1024 * 1024, files: 1, parts: 2 },
    }),
  )
  @HttpCode(201)
  async submit(
    @CurrentUser() user: JwtPayload,
    @UploadedFiles()
    files: { front?: Express.Multer.File[] },
    @Query() query: SubmitDiagnosisQueryDto,
  ): Promise<SkinScoreSnapshotDto> {
    // 필드 존재 검증 — 누락된 필드는 400.
    const front = files?.front?.[0];
    if (!front) {
      throw new BadRequestException('정면(front) 이미지가 필요합니다');
    }
    if ((query.lat === undefined) !== (query.lon === undefined)) {
      throw new BadRequestException('lat과 lon은 함께 보내야 합니다');
    }

    const images = {
      front: toInferenceImage(front),
    };

    return this.diagnosisService.submit(user.sub, images, {
      lat: query.lat,
      lon: query.lon,
    });
  }
}

/**
 * Express.Multer.File을 InferenceImage로 변환.
 * 버퍼는 메모리에 있으며 처리 후 참조를 끊어 GC되도록 한다.
 */
function toInferenceImage(file: Express.Multer.File): InferenceImage {
  return {
    buffer: file.buffer,
    mimetype: file.mimetype,
    size: file.size,
  };
}
