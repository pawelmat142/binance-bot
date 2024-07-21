import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { createMyLogger } from './global/logger';
import { AppExceptionFilter } from './global/exceptions/exception-filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: createMyLogger()
  })


  app.useGlobalFilters(new AppExceptionFilter())

  await app.listen(process.env.PORT ?? 3000)
}
bootstrap()