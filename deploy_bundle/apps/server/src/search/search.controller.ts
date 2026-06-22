import { Controller, Post, Get, Body, Query, Param, UseGuards } from '@nestjs/common';
import { SearchService } from './search.service';
import { CreateSearchPostDto } from './dto/create-search-post.dto';
import { SearchQueryDto } from './dto/search-query.dto';
import { Public } from '../auth/public.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('search')
@UseGuards(JwtAuthGuard)
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Post('post')
  @Public()
  async createPost(@Body() dto: CreateSearchPostDto) {
    return await this.searchService.createPost(
      dto.origin_place,
      dto.xipai_keywords,
      dto.contact_info,
      dto.created_by
    );
  }

  @Get('posts')
  @Public()
  async search(@Query() query: SearchQueryDto) {
    return await this.searchService.search(query.query, query.origin_place);
  }

  @Get('post/:id')
  async getPost(@Param('id') id: string) {
    return await this.searchService.getPostById(BigInt(id));
  }

  @Get('post/:id/contact')
  async getContactInfo(@Param('id') id: string) {
    const contactInfo = await this.searchService.decryptContactInfo(BigInt(id), true);
    return { contact_info: contactInfo };
  }
}
