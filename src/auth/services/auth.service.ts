import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async validateUser(email: string) {
    const user = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, name: true, avatar: true },
    });

    if (!user) {
      return null;
    }

    return user;
  }

  async login(email: string) {
    const user = await this.validateUser(email);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const token = await this.jwtService.signAsync({
      sub: user.id,
      email: user.email,
      name: user.name,
    });

    return { access_token: token, user };
  }

  async register(email: string, name: string) {
    const existingUser = await this.prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      throw new ConflictException('Email already in use');
    }

    const user = await this.prisma.user.create({
      data: { email, name },
      select: { id: true, email: true, name: true, createdAt: true },
    });

    return user;
  }
}
