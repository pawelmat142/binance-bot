import { ArgumentsHost, Catch, ExceptionFilter, Logger } from "@nestjs/common";

@Catch()
export class AppExceptionFilter implements ExceptionFilter {

    private readonly logger = new Logger(this.constructor.name)
    
    // TODO - experimental
    catch(exception: unknown, host: ArgumentsHost) {

        this.logger.error('[START] exception')
        this.logger.error(exception)
        this.logger.error('[STOP] exception')
        
        this.logger.error('[START] host')
        this.logger.error(host)
        this.logger.error('[STOP] host')
    }
    
}