import { type AxiosResponseHeaders } from 'axios';
import { useContext, useEffect, useId } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';

import { useMutation } from '@tanstack/react-query';

import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

import { CtciLogo } from '@/components/ctci-logo';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Authorization } from '@/constants/authorization';

import { useAuth } from '@/hooks/auth-hooks';
import { cn } from '@/lib/utils';
import { Routes } from '@/routes';
import { rsaPsw } from '@/utils';
import authorizationUtil from '@/utils/authorization-util';

import { login } from '@/services/admin-service';

import { CurrentUserInfoContext } from './layouts/root-layout';

const inputAccent =
  'h-10 focus-visible:ring-2 focus-visible:ring-[#F39800]/40 focus-visible:border-[#F39800]/60 transition-colors duration-200';

function AdminLogin() {
  const navigate = useNavigate();
  const [, setCurrentUserInfo] = useContext(CurrentUserInfoContext);
  const { t } = useTranslation('translation', { keyPrefix: 'login' });
  const { isLogin } = useAuth();

  const loginMutation = useMutation({
    mutationKey: ['adminLogin'],
    mutationFn: async (params: { email: string; password: string }) => {
      const rsaPassWord = rsaPsw(params.password) as string;
      return await login({
        email: params.email,
        password: rsaPassWord,
      });
    },
    onSuccess: (request) => {
      const { data: req, headers } = request;

      if (req?.code === 0) {
        const authorization = (headers as AxiosResponseHeaders)?.get(
          Authorization,
        );
        const token = req.data.access_token;

        // Lift to global user info context
        setCurrentUserInfo({
          userInfo: req.data,
          source: 'serverRequest',
        });

        authorizationUtil.setItems({
          Authorization: authorization as string,
          Token: token,
          userInfo: JSON.stringify({
            ...req.data,
            name: req.data.nickname,
          }),
        });

        navigate('/admin/services');
      }
    },
    onError: (error) => {
      console.log('Failed:', error);
    },
    retry: false,
  });

  const loading = loginMutation.isPending;

  useEffect(() => {
    if (isLogin) {
      navigate(Routes.AdminServices);
    }
  }, [isLogin, navigate]);

  const FormSchema = z.object({
    email: z
      .string()
      .email()
      .min(1, { message: t('emailPlaceholder') }),
    password: z.string().min(1, { message: t('passwordPlaceholder') }),
    remember: z.boolean().optional(),
  });

  const formId = useId();
  const form = useForm({
    defaultValues: {
      email: '',
      password: '',
      remember: false,
    },
    resolver: zodResolver(FormSchema),
  });

  return (
    <div
      className="relative h-[inherit] min-h-screen overflow-auto isolate"
      style={
        {
          // Scoped light-theme palette (mirrors the user login page).
          '--text-primary': '15 23 42',
          '--text-primary-inverse': '15 23 42',
          '--text-secondary': '71 85 105',
          '--text-secondary-inverse': '71 85 105',
          '--text-disabled': '#64748B',
          '--text-input-tip': '#64748B',
          '--bg-base': '#D6DAE0',
          '--bg-component': '#FFFFFF',
          '--bg-input': 'rgba(15, 23, 42, 0.025)',
          '--bg-card': 'rgba(15, 23, 42, 0.04)',
          '--border-default': 'rgba(15, 23, 42, 0.12)',
          '--border-accent': '#0F172A',
          '--border-button': 'rgba(15, 23, 42, 0.10)',
          '--input-border': 'rgba(15, 23, 42, 0.15)',
        } as React.CSSProperties
      }
    >
      {/* Premium light background: concrete-gray gradient + restrained warm radial */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            'radial-gradient(ellipse 75% 50% at 50% -15%, rgba(243, 152, 0, 0.11), transparent 62%),' +
            'radial-gradient(ellipse 60% 40% at 50% 115%, rgba(243, 152, 0, 0.07), transparent 60%),' +
            'linear-gradient(180deg, #D6DAE0 0%, #C5CBD3 55%, #B3BAC3 100%)',
        }}
      />
      {/* Faint grid texture */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 opacity-[0.18]"
        style={{
          backgroundImage:
            'linear-gradient(rgba(15, 23, 42, 0.04) 1px, transparent 1px),' +
            'linear-gradient(90deg, rgba(15, 23, 42, 0.04) 1px, transparent 1px)',
          backgroundSize: '48px 48px',
          maskImage:
            'radial-gradient(ellipse 90% 70% at 50% 50%, #000 30%, transparent 75%)',
          WebkitMaskImage:
            'radial-gradient(ellipse 90% 70% at 50% 50%, #000 30%, transparent 75%)',
        }}
      />

      <ScrollArea className="h-full">
        <div className="relative min-h-screen">
          {/* Top-left brand block */}
          <div className="absolute top-8 left-10 z-30 flex items-center gap-4">
            <CtciLogo size={38} className="text-text-primary" />
            <div className="h-9 w-px bg-text-primary/15" />
            <div className="flex flex-col leading-tight">
              <span className="text-[22px] font-bold tracking-[0.18em] text-text-primary">
                京鼎
              </span>
              <span className="text-[10px] tracking-[0.32em] text-text-secondary uppercase mt-0.5">
                CTCI Engineering
              </span>
            </div>
          </div>

          {/* Hero + Form */}
          <div className="relative z-10 flex flex-col items-center justify-center min-h-screen px-4 py-24">
            <div className="text-center mb-10">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-[#F39800]/30 bg-[#F39800]/5 text-[11px] tracking-[0.25em] text-[#F39800] uppercase mb-6">
                <span className="size-1.5 rounded-full bg-[#F39800] animate-pulse" />
                CTCI Admin Console
              </div>
              <h1 className="text-[36px] sm:text-[44px] font-medium leading-tight tracking-tight text-text-primary">
                {t('loginTitle', { keyPrefix: 'admin' })}
              </h1>
            </div>

            <div className="w-full max-w-[480px]">
              <Card
                className={cn(
                  'w-full bg-bg-component/85 backdrop-blur-md rounded-2xl',
                  'border border-border-button/80',
                  'shadow-[0_20px_60px_-15px_rgba(243,152,0,0.18)]',
                )}
              >
                <CardContent className="px-10 pt-12 pb-8">
                  <Form {...form}>
                    <form
                      id={formId}
                      className="space-y-7 text-text-primary"
                      onSubmit={form.handleSubmit((data) =>
                        loginMutation.mutate(data),
                      )}
                    >
                      <FormField
                        control={form.control}
                        name="email"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel required>{t('emailLabel')}</FormLabel>
                            <FormControl>
                              <Input
                                className={inputAccent}
                                placeholder={t('emailPlaceholder')}
                                autoComplete="email"
                                {...field}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="password"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel required>{t('passwordLabel')}</FormLabel>
                            <FormControl>
                              <Input
                                {...field}
                                className={inputAccent}
                                type="password"
                                placeholder={t('passwordPlaceholder')}
                                autoComplete="password"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="remember"
                        render={({ field }) => (
                          <FormItem className="!mt-5">
                            <FormLabel
                              className={cn(
                                'transition-colors',
                                field.value
                                  ? 'text-text-primary'
                                  : 'text-text-secondary',
                              )}
                            >
                              <FormControl>
                                <Checkbox
                                  checked={field.value}
                                  onCheckedChange={field.onChange}
                                  className="data-[state=checked]:bg-[#F39800] data-[state=checked]:border-[#F39800]"
                                />
                              </FormControl>
                              <span className="ml-2">{t('rememberMe')}</span>
                            </FormLabel>
                          </FormItem>
                        )}
                      />
                    </form>
                  </Form>
                </CardContent>

                <CardFooter className="px-10 pb-12">
                  <Button
                    form={formId}
                    size="lg"
                    block
                    type="submit"
                    loading={loading}
                    className={cn(
                      'group/btn relative w-full overflow-hidden border-0',
                      'text-white font-semibold tracking-wide',
                      'bg-gradient-to-r from-[#F39800] via-[#FF8C00] to-[#FFA826]',
                      'hover:from-[#FFA826] hover:via-[#FF9A1F] hover:to-[#FFB347]',
                      'shadow-[0_8px_24px_-6px_rgba(243,152,0,0.55)]',
                      'hover:shadow-[0_12px_32px_-6px_rgba(243,152,0,0.75)]',
                      'transition-all duration-300',
                    )}
                  >
                    <span className="relative z-10">{t('login')}</span>
                    <span
                      aria-hidden
                      className="pointer-events-none absolute inset-y-0 -left-1/3 w-1/3 skew-x-12 bg-white/30 opacity-0 group-hover/btn:opacity-100 group-hover/btn:translate-x-[420%] transition-all duration-700 ease-out"
                    />
                  </Button>
                </CardFooter>
              </Card>
            </div>
          </div>

          {/* Footer */}
          <div className="absolute bottom-6 left-0 right-0 z-20 text-center text-[11px] text-text-secondary/60 tracking-[0.2em] pointer-events-none">
            © 2026 京鼎工程股份有限公司 · CTCI CORPORATION
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}

export default AdminLogin;
