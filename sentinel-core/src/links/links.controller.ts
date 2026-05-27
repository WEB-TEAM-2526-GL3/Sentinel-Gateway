import { Controller, Get, Post, Delete, Param, Body } from '@nestjs/common';
import { LinkService } from './link.service';
import { CreateLinkDto } from './dto/create-link.dto';
import { SwitchLinkDto } from './dto/switch-link.dto';

@Controller()
export class LinksController {
  constructor(private readonly linkService: LinkService) {}

  @Get('clients/:clientId/links')
  getByClient(@Param('clientId') clientId: string) {
    return this.linkService.getClientStatus(clientId);
  }

  @Get('providers/:providerId/links')
  getByProvider(@Param('providerId') providerId: string) {
    return this.linkService.getLinksForProvider(providerId);
  }

  @Post('links')
  create(@Body() dto: CreateLinkDto) {
    return this.linkService.linkClientToProvider(dto);
  }

  @Post('links/switch')
  switchPrimary(@Body() dto: SwitchLinkDto) {
    return this.linkService.selectLink(dto.clientId, dto.linkId);
  }

  @Post('links/:id/activate')
  activate(@Param('id') id: string) {
    return this.linkService.activateLink(id);
  }

  @Delete('links/:id')
  archive(@Param('id') id: string) {
    return this.linkService.archiveLink(id);
  }
}
