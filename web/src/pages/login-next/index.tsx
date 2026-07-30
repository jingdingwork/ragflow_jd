import SvgIcon from '@/components/svg-icon';
import { useAuth } from '@/hooks/auth-hooks';
import {
  useLogin,
  useLoginChannels,
  useLoginWithChannel,
  useLoginWithChannelPassword,
  useRegister,
} from '@/hooks/use-login-request';
import { useSystemConfig } from '@/hooks/use-system-request';
import { rsaPsw } from '@/utils';
import { useContext, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';

import { CtciFullLogo } from '@/components/ctci-logo';
import { Button, ButtonLoading } from '@/components/ui/button';
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
import { cn } from '@/lib/utils';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, UseFormReturn } from 'react-hook-form';
import { z } from 'zod';
import FlipCard3D, { FlipFaceContext } from './card';
import './index.less';

const BRAND_GRADIENT_FROM = '#F39800';
const BRAND_GRADIENT_VIA = '#FF8C00';
const BRAND_GRADIENT_TO = '#FFC373';

const inputAccent =
  'focus-visible:ring-2 focus-visible:ring-[#F39800]/40 focus-visible:border-[#F39800]/60 transition-colors duration-200';

type LoginFormContentProps = {
  isLoginPage: boolean;
  title: string;
  form: UseFormReturn<any>;
  loading: boolean;
  onCheck: (params: any) => Promise<void>;
  changeTitle: () => void;
  registerEnabled: boolean;
  channels: { channel: string; icon?: string; display_name: string }[];
  handleLoginWithChannel: (channel: string) => void;
  t: ReturnType<typeof useTranslation>['t'];
  disablePasswordLogin?: boolean;
};

function LoginFormContent({
  isLoginPage,
  title,
  form,
  loading,
  onCheck,
  changeTitle,
  registerEnabled,
  channels,
  handleLoginWithChannel,
  t,
  disablePasswordLogin,
}: LoginFormContentProps) {
  const face = useContext(FlipFaceContext);
  const isActiveFace = isLoginPage ? face === 'front' : face === 'back';

  return (
    <div className="flex flex-col items-center justify-center w-full">
      <div className="text-center mb-7">
        <h2 className="text-xl font-semibold text-text-primary">
          {title === 'login' ? t('loginTitle') : t('signUpTitle')}
        </h2>
        <p className="text-text-secondary text-xs mt-2 tracking-wide">
          {title === 'login' ? t('loginDescription') : t('registerDescription')}
        </p>
      </div>
      <div
        className={cn(
          // NOTE: no backdrop-filter here. This card lives inside FlipCard3D's
          // `preserve-3d` context, and backdrop-blur inside a 3D-transformed
          // ancestor renders as an opaque black box on some GPUs. Use a solid
          // translucent fill instead.
          'w-full max-w-[540px] bg-bg-component/90',
          'rounded-2xl pt-12 pl-10 pr-10 pb-3',
          'border border-border-button/80',
          'shadow-[0_20px_60px_-15px_rgba(243,152,0,0.18)]',
        )}
      >
        {!disablePasswordLogin && (
          <Form {...form}>
            <form
              className="flex flex-col gap-7 text-text-primary"
              data-testid="auth-form"
              data-active={isActiveFace ? 'true' : undefined}
              onSubmit={form.handleSubmit(onCheck)}
            >
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel required>
                      {title === 'login'
                        ? t('employeeIdLabel')
                        : t('emailLabel')}
                    </FormLabel>
                    <FormControl>
                      <Input
                        data-testid="auth-email"
                        placeholder={
                          title === 'login'
                            ? t('employeeIdPlaceholder')
                            : t('emailPlaceholder')
                        }
                        autoComplete={title === 'login' ? 'username' : 'email'}
                        className={inputAccent}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {title === 'register' && (
                <FormField
                  control={form.control}
                  name="nickname"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel required>{t('nicknameLabel')}</FormLabel>
                      <FormControl>
                        <Input
                          data-testid="auth-nickname"
                          placeholder={t('nicknamePlaceholder')}
                          autoComplete="username"
                          className={inputAccent}
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel required>{t('passwordLabel')}</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Input
                          data-testid="auth-password"
                          type={'password'}
                          placeholder={t('passwordPlaceholder')}
                          autoComplete={
                            title === 'login'
                              ? 'current-password'
                              : 'new-password'
                          }
                          className={inputAccent}
                          {...field}
                        />
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {title === 'login' && (
                <FormField
                  control={form.control}
                  name="remember"
                  render={({ field }) => (
                    <FormItem>
                      <FormControl>
                        <div className="flex gap-2 items-center">
                          <Checkbox
                            checked={field.value}
                            onCheckedChange={(checked) => {
                              field.onChange(checked);
                            }}
                            className="data-[state=checked]:bg-[#F39800] data-[state=checked]:border-[#F39800]"
                          />
                          <FormLabel
                            className={cn('hover:text-text-primary text-sm', {
                              'text-text-disabled': !field.value,
                              'text-text-primary': field.value,
                            })}
                          >
                            {t('rememberMe')}
                          </FormLabel>
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
              <ButtonLoading
                data-testid="auth-submit"
                type="submit"
                loading={loading}
                className={cn(
                  'group/btn relative w-full my-7 overflow-hidden border-0',
                  'text-white font-semibold tracking-wide',
                  'bg-gradient-to-r from-[#F39800] via-[#FF8C00] to-[#FFA826]',
                  'hover:from-[#FFA826] hover:via-[#FF9A1F] hover:to-[#FFB347]',
                  'shadow-[0_8px_24px_-6px_rgba(243,152,0,0.55)]',
                  'hover:shadow-[0_12px_32px_-6px_rgba(243,152,0,0.75)]',
                  'transition-all duration-300',
                )}
              >
                <span className="relative z-10">
                  {title === 'login' ? t('login') : t('continue')}
                </span>
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-y-0 -left-1/3 w-1/3 skew-x-12 bg-white/30 opacity-0 group-hover/btn:opacity-100 group-hover/btn:translate-x-[420%] transition-all duration-700 ease-out"
                />
              </ButtonLoading>
            </form>
          </Form>
        )}

        {/* Redirect-based SSO button. The visible password form already logs in
            through the OIDC channel directly, so only show this fallback when
            that form is hidden (disablePasswordLogin). */}
        {title === 'login' &&
          disablePasswordLogin &&
          channels &&
          channels.length > 0 && (
            <div
              className={
                disablePasswordLogin
                  ? 'py-8'
                  : 'mt-3 pt-4 border-t border-border-default/50'
              }
            >
              {channels.map((item) => (
                <Button
                  variant={'transparent'}
                  key={item.channel}
                  onClick={() => handleLoginWithChannel(item.channel)}
                  style={{ marginTop: 10 }}
                  className={cn(
                    'hover:bg-[#F39800]/5 hover:text-[#F39800] transition-colors duration-200',
                    disablePasswordLogin ? 'w-full' : '',
                  )}
                >
                  <div className="flex items-center">
                    <SvgIcon
                      name={item.icon || 'sso'}
                      width={20}
                      height={20}
                      style={{ marginRight: 5 }}
                    />
                    Sign in with {item.display_name}
                  </div>
                </Button>
              ))}
            </div>
          )}

        {!disablePasswordLogin && title === 'login' && registerEnabled && (
          <div className="mt-8 text-right">
            <p className="text-text-disabled text-sm">
              {t('signInTip')}
              <Button
                data-testid="auth-toggle-register"
                variant={'transparent'}
                onClick={changeTitle}
                className="text-[#F39800]/90 hover:text-[#FFA826] hover:bg-transparent font-medium border-none transition-colors duration-200"
              >
                {t('signUp')}
              </Button>
            </p>
          </div>
        )}
        {!disablePasswordLogin && title === 'register' && (
          <div className="mt-8 text-right">
            <p className="text-text-disabled text-sm">
              {t('signUpTip')}
              <Button
                data-testid="auth-toggle-login"
                variant={'transparent'}
                onClick={changeTitle}
                className="text-[#F39800]/90 hover:text-[#FFA826] hover:bg-transparent font-medium border-none transition-colors duration-200"
              >
                {t('login')}
              </Button>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

const Login = () => {
  const [title, setTitle] = useState('login');
  const navigate = useNavigate();
  const { loading: signLoading } = useLogin();
  const { register, loading: registerLoading } = useRegister();
  const { channels, loading: channelsLoading } = useLoginChannels();
  const { login: loginWithChannel, loading: loginWithChannelLoading } =
    useLoginWithChannel();
  const {
    login: loginWithChannelPassword,
    loading: loginWithChannelPasswordLoading,
  } = useLoginWithChannelPassword();
  const { t } = useTranslation('translation', { keyPrefix: 'login' });
  const [isLoginPage, setIsLoginPage] = useState(true);

  const loading =
    signLoading ||
    registerLoading ||
    channelsLoading ||
    loginWithChannelLoading ||
    loginWithChannelPasswordLoading;
  const { config } = useSystemConfig();
  // 企业内网产品：用户端不开放自助注册，账号由管理员统一开通，隐藏注册入口。
  const registerEnabled = false;
  // The local login form authenticates the employee id + password against the
  // OIDC channel (ROPC) instead of the legacy email/password login.
  const oidcChannel = channels?.[0]?.channel ?? 'oidc';

  const { isLogin } = useAuth();
  useEffect(() => {
    if (isLogin) {
      navigate('/');
    }
  }, [isLogin, navigate]);

  const handleLoginWithChannel = async (channel: string) => {
    await loginWithChannel(channel);
  };

  const changeTitle = () => {
    setIsLoginPage(title !== 'login');
    if (title === 'login' && !registerEnabled) {
      return;
    }

    setTimeout(() => {
      setTitle(title === 'login' ? 'register' : 'login');
    }, 200);
  };

  const FormSchema = z
    .object({
      nickname: z.string(),
      // For login this field holds the employee id (OIDC username); for
      // register it must still be a valid email address.
      email: z.string().min(1, {
        message:
          title === 'login'
            ? t('employeeIdPlaceholder')
            : t('emailPlaceholder'),
      }),
      password: z.string().min(1, { message: t('passwordPlaceholder') }),
      remember: z.boolean().optional(),
    })
    .superRefine((data, ctx) => {
      if (title === 'register' && !data.nickname) {
        ctx.addIssue({
          path: ['nickname'],
          message: 'nicknamePlaceholder',
          code: z.ZodIssueCode.custom,
        });
      }
      if (
        title === 'register' &&
        data.email &&
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)
      ) {
        ctx.addIssue({
          path: ['email'],
          message: t('emailPlaceholder'),
          code: z.ZodIssueCode.custom,
        });
      }
    });
  type FormValues = z.infer<typeof FormSchema>;
  const form = useForm<FormValues>({
    defaultValues: {
      nickname: '',
      email: '',
      password: '',
      remember: false,
    },
    resolver: zodResolver(FormSchema),
  });

  const onCheck = async (params: FormValues) => {
    try {
      const rsaPassWord = rsaPsw(params.password) as string;

      if (title === 'login') {
        // Log in by handing the employee id + password to the OIDC channel
        // directly (ROPC), skipping the identity provider's login page.
        const code = await loginWithChannelPassword({
          channel: oidcChannel,
          username: `${params.email}`.trim(),
          password: rsaPassWord,
        });
        if (code === 0) {
          navigate('/');
        }
      } else {
        const code = await register({
          nickname: params.nickname,
          email: params.email,
          password: rsaPassWord,
        });
        if (code === 0) {
          setTitle('login');
        }
      }
    } catch (errorInfo) {
      console.log('Failed:', errorInfo);
    }
  };

  return (
    <div
      className="relative h-[inherit] overflow-auto isolate"
      style={
        {
          // Scoped light-theme palette: overrides global dark theme just on this page.
          // Slate palette (cool grays) matches the neutral cool background temperature.
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

      {/* Faint grid texture, restrained — adds engineering precision without noise */}
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

      <div className="relative min-h-full overflow-auto">
        {/* Top-left brand block */}
        <div className="absolute top-8 left-10 z-30 flex items-center group cursor-default animate-fade-in-down">
          <div className="relative">
            <div className="absolute -inset-2 rounded-xl bg-[#F39800]/0 group-hover:bg-[#F39800]/10 blur-md transition-all duration-500" />
            <CtciFullLogo
              variant="dark"
              height={52}
              className="relative transition-transform duration-300 group-hover:scale-105"
            />
          </div>
        </div>

        {/* Hero + Form */}
        <div className="relative z-10 flex flex-col items-center justify-center min-h-full px-4 sm:px-6 lg:px-8 pt-16 pb-16">
          <div className="text-center mb-12 animate-fade-in-up">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-[#F39800]/30 bg-[#F39800]/5 text-[11px] tracking-[0.25em] text-[#F39800] uppercase mb-6">
              <span className="size-1.5 rounded-full bg-[#F39800] animate-pulse" />
              Intelligent Platform
            </div>
            <h1 className="text-[42px] sm:text-[52px] font-medium leading-tight tracking-tight text-text-primary">
              {t('welcomeIntro')}{' '}
              <span
                className="font-bold text-transparent bg-clip-text bg-gradient-to-r inline-block"
                style={{
                  backgroundImage: `linear-gradient(90deg, ${BRAND_GRADIENT_FROM}, ${BRAND_GRADIENT_VIA}, ${BRAND_GRADIENT_TO})`,
                  WebkitBackgroundClip: 'text',
                }}
              >
                {t('brandName')}
              </span>
            </h1>
            <p className="text-text-secondary text-base mt-4 max-w-xl mx-auto leading-relaxed">
              {t('brandTagline')}
            </p>
          </div>

          {/* Login Form */}
          <FlipCard3D isLoginPage={isLoginPage}>
            <LoginFormContent
              isLoginPage={isLoginPage}
              title={title}
              form={form}
              loading={loading}
              onCheck={onCheck}
              changeTitle={changeTitle}
              registerEnabled={registerEnabled}
              channels={channels || []}
              handleLoginWithChannel={handleLoginWithChannel}
              t={t}
              disablePasswordLogin={!!config?.disablePasswordLogin}
            />
          </FlipCard3D>
        </div>

        {/* Footer */}
        <div className="relative z-20 shrink-0 pb-6 pt-4 text-center text-[11px] text-text-secondary/60 tracking-[0.2em] pointer-events-none">
          © 2026 京鼎工程股份有限公司 · CTCI CORPORATION
        </div>
      </div>
    </div>
  );
};

export default Login;
