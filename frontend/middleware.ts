import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  // 暂时禁用认证检查，让开发更顺畅
  return NextResponse.next()

  /*
  // 检查Supabase认证cookie
  const hasAuthCookie = Array.from(request.cookies.getAll()).some(
    cookie => cookie.name.startsWith('sb-') && cookie.name.includes('auth-token')
  )

  // 检查是否访问dashboard路由
  if (request.nextUrl.pathname.startsWith('/dashboard')) {
    if (!hasAuthCookie) {
      // 未登录，重定向到登录页面
      return NextResponse.redirect(new URL('/login', request.url))
    }
  }

  // 如果已登录且访问登录/注册页面，重定向到dashboard
  if (request.nextUrl.pathname === '/login' || request.nextUrl.pathname === '/register') {
    if (hasAuthCookie) {
      return NextResponse.redirect(new URL('/dashboard', request.url))
    }
  }

  return NextResponse.next()
  */
}

export const config = {
  matcher: ['/dashboard/:path*', '/login', '/register']
}
