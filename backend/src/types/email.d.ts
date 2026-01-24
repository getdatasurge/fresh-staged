import type { EmailService } from '../services/email.service.js';

declare module 'fastify' {
  interface FastifyInstance {
    emailService: EmailService;
  }
}
