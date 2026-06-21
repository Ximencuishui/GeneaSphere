import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { RegisterDto, LoginDto } from './dto/auth.dto';

@Injectable()
export class AuthService {
  private prisma = new PrismaClient();

  constructor(private jwtService: JwtService) {}

  async register(registerDto: RegisterDto) {
    const { phone, password } = registerDto;

    const existingUser = await this.prisma.user.findUnique({ where: { phone } });
    if (existingUser) {
      throw new Error('User already exists');
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const user = await this.prisma.user.create({
      data: {
        phone,
        password_hash: passwordHash,
      },
    });

    const payload = { sub: user.id, phone: user.phone };
    const token = this.jwtService.sign(payload);

    return {
      access_token: token,
      user: { id: user.id, phone: user.phone },
    };
  }

  async login(loginDto: LoginDto) {
    const { phone, password } = loginDto;

    const user = await this.prisma.user.findUnique({ where: { phone } });
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const isPasswordValid = await bcrypt.compare(password, user.password_hash);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const payload = { sub: user.id, phone: user.phone };
    const token = this.jwtService.sign(payload);

    return {
      access_token: token,
      user: { id: user.id, phone: user.phone },
    };
  }

  async demoLogin() {
    const phone = '13800000000';
    const password = 'demo123';

    const user = await this.prisma.user.findUnique({ where: { phone } });
    if (!user) {
      throw new UnauthorizedException('演示账号尚未初始化，请稍后再试');
    }

    const isPasswordValid = await bcrypt.compare(password, user.password_hash);
    if (!isPasswordValid) {
      throw new UnauthorizedException('演示账号尚未初始化，请稍后再试');
    }

    // 查找演示家族
    const demoClan = await this.prisma.clan.findFirst({
      where: { name: '李氏宗族（演示）' },
      select: { id: true },
    });

    const payload = { sub: user.id, phone: user.phone };
    const token = this.jwtService.sign(payload);

    return {
      access_token: token,
      user: { id: user.id, phone: user.phone },
      demoClanId: demoClan ? String(demoClan.id) : null,
    };
  }
}