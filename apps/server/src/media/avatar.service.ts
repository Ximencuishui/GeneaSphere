import { Injectable } from '@nestjs/common';
import sharp from 'sharp';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class AvatarService {
  private readonly thumbnailsRoot: string;

  constructor() {
    this.thumbnailsRoot = process.env.THUMBNAILS_PATH
      ? path.resolve(process.env.THUMBNAILS_PATH)
      : path.join(process.cwd(), 'storage', 'media', 'thumbnails');

    if (!fs.existsSync(this.thumbnailsRoot)) {
      fs.mkdirSync(this.thumbnailsRoot, { recursive: true });
    }
  }

  /**
   * Generate a square thumbnail (center-cropped) from a source image
   * @param sourcePath Absolute or relative path to the source image
   * @param size Target thumbnail size in pixels (width and height)
   * @returns The relative URL path of the generated thumbnail, or null on failure
   */
  async generateThumbnail(sourcePath: string, size: number = 200): Promise<string | null> {
    try {
      const resolvedPath = path.resolve(sourcePath);
      if (!fs.existsSync(resolvedPath)) {
        console.error(`Source image not found: ${resolvedPath}`);
        return null;
      }

      const ext = path.extname(resolvedPath) || '.jpg';
      const basename = path.basename(resolvedPath, ext);
      const thumbnailFilename = `${basename}_${size}w${ext}`;
      const thumbnailPath = path.join(this.thumbnailsRoot, thumbnailFilename);

      // Skip if thumbnail already exists
      if (fs.existsSync(thumbnailPath)) {
        return `/media/thumbnails/${thumbnailFilename}`;
      }

      // Generate square center-cropped thumbnail
      const metadata = await sharp(resolvedPath).metadata();
      const width = metadata.width || size;
      const height = metadata.height || size;
      const minDim = Math.min(width, height);

      const left = Math.floor((width - minDim) / 2);
      const top = Math.floor((height - minDim) / 2);

      await sharp(resolvedPath)
        .extract({ left, top, width: minDim, height: minDim })
        .resize(size, size, { fit: 'cover', position: 'centre' })
        .jpeg({ quality: 85, progressive: true })
        .toFile(thumbnailPath);

      return `/media/thumbnails/${thumbnailFilename}`;
    } catch (error) {
      console.error('Failed to generate thumbnail:', error);
      return null;
    }
  }

  /**
   * Check if an image is grayscale (saturation below threshold)
   * This is used to preserve original black-and-white photos without forcing colorization
   */
  async isGrayscaleImage(sourcePath: string): Promise<boolean> {
    try {
      const resolvedPath = path.resolve(sourcePath);
      if (!fs.existsSync(resolvedPath)) return false;

      const metadata = await sharp(resolvedPath).metadata();
      // If the image has 1 or 2 channels, it's inherently grayscale
      if (metadata.channels && metadata.channels < 3) return true;

      // Sample pixels to check saturation
      const stats = await sharp(resolvedPath)
        .resize(50, 50, { fit: 'cover' })
        .raw()
        .toBuffer({ resolveWithObject: true });

      const { data, info } = stats;
      let totalSaturation = 0;
      let pixelCount = 0;

      for (let i = 0; i < data.length; i += info.channels) {
        if (info.channels >= 3) {
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          const max = Math.max(r, g, b);
          const min = Math.min(r, g, b);
          const saturation = max === 0 ? 0 : (max - min) / max;
          totalSaturation += saturation;
          pixelCount++;
        }
      }

      const avgSaturation = pixelCount > 0 ? totalSaturation / pixelCount : 0;
      // Threshold: if average saturation is very low, treat as grayscale
      return avgSaturation < 0.05;
    } catch {
      return false;
    }
  }

  /**
   * Generate a person avatar thumbnail from a media file
   */
  async generatePersonAvatar(mediaFilePath: string, personId: bigint): Promise<string | null> {
    const thumbnailUrl = await this.generateThumbnail(mediaFilePath, 200);
    if (!thumbnailUrl) return null;

    // Also generate a smaller 80x80 version for tree display
    await this.generateThumbnail(mediaFilePath, 80);

    return thumbnailUrl;
  }

  /**
   * Delete thumbnails for a given source file
   */
  async deleteThumbnails(sourcePath: string): Promise<void> {
    try {
      const ext = path.extname(sourcePath) || '.jpg';
      const basename = path.basename(sourcePath, ext);

      for (const size of [80, 200]) {
        const thumbnailPath = path.join(this.thumbnailsRoot, `${basename}_${size}w${ext}`);
        if (fs.existsSync(thumbnailPath)) {
          fs.unlinkSync(thumbnailPath);
        }
      }
    } catch (error) {
      console.error('Failed to delete thumbnails:', error);
    }
  }
}
