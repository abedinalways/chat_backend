import {
  Injectable,
  NotFoundException,
  ConflictException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../prisma/prisma.service';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) { }

  async validateUser(email: string, password: string) {
    // Use Prisma without select to get all fields including password
    // Type assertion needed due to Prisma client generation
    const user = (await this.prisma.user.findUnique({
      where: { email },
    })) as { id: string; email: string; name: string; avatar?: string | null; password: string } | null;

    if (!user) {
      return null;
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return null;
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password: _password, ...result } = user;
    return result;
  }

  async login(email: string, password: string) {
    const user = await this.validateUser(email, password);
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const token = await this.jwtService.signAsync({
      sub: user.id,
      email: user.email,
      name: user.name,
    });

    return { access_token: token, user };
  }

  async register(email: string, name: string, password: string) {
    const existingUser = await this.prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      throw new ConflictException('Email already in use');
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    // Use type assertion for password field due to Prisma generation
    const user = (await this.prisma.user.create({
      data: { email, name, password: hashedPassword } as any,
      select: {
        id: true,
        email: true,
        name: true,
        createdAt: true,
      },
    })) as { id: string; email: string; name: string; createdAt: Date };

    return user;
  }
}
