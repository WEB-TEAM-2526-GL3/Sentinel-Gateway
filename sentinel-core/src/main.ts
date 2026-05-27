import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { loadEnvFile } from 'node:process';

function loadLocalEnv() {
  const envCandidates = [
    join(process.cwd(), '.env'),
    join(process.cwd(), 'sentinel-core', '.env'),
  ];

  for (const envPath of envCandidates) {
    if (existsSync(envPath)) {
      loadEnvFile(envPath);
      return;
    }
  }
}

async function bootstrap() {
  loadLocalEnv();
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );
  await app.listen(process.env.PORT ?? 3000);
}
void bootstrap();
