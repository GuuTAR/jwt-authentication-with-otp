import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseFilters,
  UseGuards,
  UseInterceptors,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger'

import {
  ApiCreatedResponseOf,
  ApiErrorResponses,
  ApiOkResponseOf,
  ApiOkResponseWithoutBody,
} from '../common/api-response.decorator.js'
import { HttpExceptionFilter } from '../common/http-exception.filter.js'
import { ResponseMessage } from '../common/response-message.decorator.js'
import { ResponseInterceptor } from '../common/response.interceptor.js'

import { CurrentUser } from '../auth/current-user.decorator.js'
import { type AuthPrincipal, JwtAuthGuard } from '../auth/jwt-auth.guard.js'

import { TodoCreateRequest } from './dto/create-todo.dto.js'
import { Todo } from './todo.model.js'
import { TodosService } from './todos.service.js'

const UNAUTHORIZED = { status: 401, description: 'Unauthorized' }
const BAD_REQUEST = { status: 400, description: 'Bad Request' }
const NOT_FOUND = { status: 404, description: 'Not Found' }
const SERVER_ERROR = { status: 500, description: 'Internal Server Error' }

@ApiTags('todos')
@ApiBearerAuth('BearerAuth')
@Controller('api/v1')
@UseGuards(JwtAuthGuard)
@UseFilters(HttpExceptionFilter)
@UseInterceptors(ResponseInterceptor)
export class TodosController {
  constructor(private readonly todosService: TodosService) {}

  @Get('todos')
  @ApiOperation({ summary: 'List todos' })
  @ResponseMessage('Todos retrieved successfully')
  @ApiOkResponseOf([Todo])
  @ApiErrorResponses(UNAUTHORIZED, SERVER_ERROR)
  findAll(@CurrentUser() user: AuthPrincipal): Promise<Todo[]> {
    return this.todosService.findAll(user.userId)
  }

  @Post('todos')
  @UsePipes(new ValidationPipe({ whitelist: true }))
  @ApiOperation({ summary: 'Create a todo' })
  @ResponseMessage('Todo created successfully')
  @ApiCreatedResponseOf(Todo)
  @ApiErrorResponses(BAD_REQUEST, UNAUTHORIZED, SERVER_ERROR)
  create(
    @CurrentUser() user: AuthPrincipal,
    @Body() body: TodoCreateRequest,
  ): Promise<Todo> {
    return this.todosService.create(user.userId, body.title)
  }

  @Patch('todos-reset')
  @ApiOperation({ summary: 'Reset all todos to not completed' })
  @ResponseMessage('Todos reset successfully')
  @ApiOkResponseWithoutBody()
  @ApiErrorResponses(UNAUTHORIZED, SERVER_ERROR)
  resetAll(@CurrentUser() user: AuthPrincipal): Promise<void> {
    return this.todosService.resetAll(user.userId)
  }

  @Patch('todos-toggle/:id')
  @ApiParam({ name: 'id', description: 'Todo ID' })
  @ApiOperation({ summary: "Toggle a todo's completed state" })
  @ResponseMessage('Todo toggled successfully')
  @ApiOkResponseOf(Todo)
  @ApiErrorResponses(BAD_REQUEST, UNAUTHORIZED, NOT_FOUND)
  toggle(
    @CurrentUser() user: AuthPrincipal,
    @Param('id') id: string,
  ): Promise<Todo> {
    return this.todosService.toggle(user.userId, id)
  }

  @Delete('todos/:id')
  @ApiParam({ name: 'id', description: 'Todo ID' })
  @ApiOperation({ summary: 'Delete a todo' })
  @ResponseMessage('Todo deleted successfully')
  @ApiOkResponseWithoutBody()
  @ApiErrorResponses(UNAUTHORIZED, NOT_FOUND)
  delete(
    @CurrentUser() user: AuthPrincipal,
    @Param('id') id: string,
  ): Promise<void> {
    return this.todosService.delete(user.userId, id)
  }
}
