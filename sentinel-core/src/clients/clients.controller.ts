import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
} from '@nestjs/common';
import { ClientService } from './client.service';
import { CreateClientDto } from './dto/create-client.dto';
import { UpdateClientDto } from './dto/update-client.dto';

@Controller('clients')
export class ClientsController {
  constructor(private readonly clientService: ClientService) {}

  @Get()
  listAll() {
    return this.clientService.listClients();
  }

  @Get(':id')
  getOne(@Param('id') id: string) {
    return this.clientService.getClient(id);
  }

  @Post()
  create(@Body() dto: CreateClientDto) {
    return this.clientService.createClient(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateClientDto) {
    return this.clientService.updateClient(id, dto);
  }

  @Delete(':id')
  archive(@Param('id') id: string) {
    return this.clientService.archiveClient(id);
  }
}
