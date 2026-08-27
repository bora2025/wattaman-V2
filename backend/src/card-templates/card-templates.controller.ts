import { Controller, Get, Post, Put, Delete, Param, Body, UseGuards } from '@nestjs/common';
import { CardTemplatesService } from './card-templates.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@Controller('card-templates')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CardTemplatesController {
  constructor(private readonly cardTemplatesService: CardTemplatesService) {}

  @Get()
  @Roles('ADMIN')
  findAll() {
    return this.cardTemplatesService.findAll();
  }

  /**
   * GET active/:cardType — returns the shared active design for a card type.
   * Accessible to ALL authenticated users (no @Roles needed).
   */
  @Get('active/:cardType')
  getActiveDesign(@Param('cardType') cardType: string) {
    return this.cardTemplatesService.getActiveDesign(cardType);
  }

  /**
   * GET :id — returns the full template (including design). ADMIN only.
   * Used by the picker to lazy-load designs on demand instead of bundling
   * them all into the list call.
   * NOTE: declared AFTER `active/:cardType` so the more specific route wins.
   */
  @Get(':id')
  @Roles('ADMIN')
  findOne(@Param('id') id: string) {
    return this.cardTemplatesService.findOne(id);
  }

  /**
   * PUT active/:cardType — saves the shared active design. ADMIN only.
   */
  @Put('active/:cardType')
  @Roles('ADMIN')
  setActiveDesign(
    @Param('cardType') cardType: string,
    @Body() body: { design: object },
  ) {
    return this.cardTemplatesService.setActiveDesign(cardType, body.design);
  }

  @Post()
  @Roles('ADMIN')
  create(@Body() body: { name: string; cardType: string; design: object }) {
    return this.cardTemplatesService.create(body);
  }

  @Delete(':id')
  @Roles('ADMIN')
  delete(@Param('id') id: string) {
    return this.cardTemplatesService.delete(id);
  }
}
