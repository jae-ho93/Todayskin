import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

/**
 * PrismaModule — 전역에서 PrismaService를 주입해 사용할 수 있도록 한다.
 * 모든 비즈니스 모듈이 DB에 접근할 때 이 모듈을 거쳐 간다.
 */
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
