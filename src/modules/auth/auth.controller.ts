import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { ThrottleProfile } from '../../common/rate-limit/throttle-profile.decorator';
import { AuthService } from './auth.service';
import { EmailCodeDto, EmailDto } from './dto/email-code.dto';
import { RegisterVendorDto } from './dto/register-vendor.dto';
import { LoginDto } from './dto/login.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { REFRESH_COOKIE } from './auth.service';

@Controller('auth')
@ThrottleProfile('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('register')
  register(@Body() input: RegisterVendorDto) {
    return this.auth.register(input);
  }

  @Post('login')
  login(
    @Body() input: LoginDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.auth.login(input, response);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  refresh(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.auth.refresh(
      readCookie(request.headers.cookie, REFRESH_COOKIE),
      response,
    );
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.auth.logout(
      readCookie(request.headers.cookie, REFRESH_COOKIE),
      response,
    );
  }

  @Post('password/change')
  @HttpCode(HttpStatus.OK)
  changePassword(
    @Body() input: ChangePasswordDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.auth.changePassword(
      readCookie(request.headers.cookie, REFRESH_COOKIE),
      input,
      response,
    );
  }

  @Post('email-verification/resend')
  @ThrottleProfile('otp')
  @HttpCode(HttpStatus.OK)
  resendVerificationCode(@Body() input: EmailDto) {
    return this.auth.resendVerificationCode(input.email);
  }

  @Post('email-verification/verify')
  @ThrottleProfile('otp')
  @HttpCode(HttpStatus.OK)
  verifyEmail(@Body() input: EmailCodeDto) {
    return this.auth.verifyEmail(input.email, input.code);
  }
}

function readCookie(
  header: string | undefined,
  name: string,
): string | undefined {
  return header
    ?.split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}
