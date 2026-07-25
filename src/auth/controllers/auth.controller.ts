import { Controller, Post, Body, BadRequestException } from '@nestjs/common';
import { AuthService } from '../services/auth.service';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  async register(@Body() body: { email: string; name: string }) {
    if (!body.email || !body.name) {
      throw new BadRequestException('Email and name are required');
    }
    return this.authService.register(body.email, body.name);
  }

  @Post('login')
  async login(@Body() body: { email: string }) {
    if (!body.email) {
      throw new BadRequestException('Email is required');
    }
    return this.authService.login(body.email);
  }
}
