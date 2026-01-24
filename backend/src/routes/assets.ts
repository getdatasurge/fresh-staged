import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { requireAuth, requireOrgContext } from '../middleware/index.js';
import * as assetStorageService from '../services/asset-storage.service.js';
import { validationError, serverError } from '../utils/errors.js';
import {
  UploadQuerySchema,
  UploadResponseSchema,
  type AssetType,
} from '../schemas/assets.js';
import { OrgParamsSchema, ErrorResponseSchema } from '../schemas/common.js';

export default async function assetRoutes(fastify: FastifyInstance) {
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  // POST /api/orgs/:organizationId/assets/upload - Upload an asset
  app.post('/upload', {
    preHandler: [requireAuth, requireOrgContext],
    schema: {
      params: OrgParamsSchema,
      querystring: UploadQuerySchema,
      response: {
        200: UploadResponseSchema,
        400: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
    },
  }, async (request, reply) => {
    try {
      // Get the uploaded file using multipart
      const file = await request.file();

      if (!file) {
        return validationError(reply, 'No file uploaded');
      }

      // Collect file data into buffer
      const chunks: Buffer[] = [];
      for await (const chunk of file.file) {
        chunks.push(chunk);
      }
      const fileBuffer = Buffer.concat(chunks);

      // Validate file before upload
      const validation = assetStorageService.validateFile(
        file.mimetype,
        fileBuffer.length
      );

      if (!validation.valid) {
        return validationError(reply, validation.error!);
      }

      // Upload to storage
      const result = await assetStorageService.uploadAsset({
        organizationId: request.user!.organizationId!,
        assetType: request.query.assetType as AssetType,
        entityId: request.query.entityId,
        filename: file.filename,
        mimeType: file.mimetype,
        data: fileBuffer,
      });

      return {
        url: result.url,
        key: result.key,
        size: result.size,
        mimeType: file.mimetype,
      };
    } catch (error) {
      if (error instanceof Error) {
        if (error.name === 'StorageConfigError') {
          return serverError(reply, 'Storage service not configured');
        }
        if (error.name === 'FileValidationError') {
          return validationError(reply, error.message);
        }
        if (error.name === 'StorageError') {
          return serverError(reply, error.message);
        }
      }
      throw error;
    }
  });
}
