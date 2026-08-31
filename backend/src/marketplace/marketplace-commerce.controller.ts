import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { MarketplaceCommerceService } from './marketplace-commerce.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('SUPER_ADMIN')
@Controller('admin/marketplace')
export class MarketplaceCommerceController {
  constructor(private readonly commerce: MarketplaceCommerceService) {}

  @Get('catalog')
  catalog() { return this.commerce.catalog(); }

  @Get('orders')
  listOrders() { return this.commerce.listOrders(); }

  @Post('orders')
  createOrder(@Body() body: { priceId?: string; currency?: string }) {
    return this.commerce.createOrder(String(body?.priceId || ''), String(body?.currency || ''));
  }
}
