import * as winston from 'winston';
import * as DailyRotateFile from 'winston-daily-rotate-file';
import { utilities as nestWinstonModuleUtilities, WinstonModule } from 'nest-winston';
import { createLogger } from 'winston';


export const createMyLogger = () => WinstonModule.createLogger({
    instance: createLogger({
      transports : [
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.timestamp(),
            winston.format.ms(),
            nestWinstonModuleUtilities.format.nestLike('MyApp', {
              colors: true,
              prettyPrint: true,
            }),
          ),
        }),

        new DailyRotateFile({
          dirname: 'logs',
          filename: '%DATE%.log',
          datePattern: 'YYYY-MM-DD', // Daily rotate pattern
          zippedArchive: true,
          maxSize: '20m',
          maxFiles: '14d',
          format: winston.format.combine(
            winston.format.timestamp(),
            winston.format.printf(({ timestamp, level, message }) => {
              return `${timestamp} [${level}] ${message}`;
            }),
          ),
        }),
      ]
    })
});