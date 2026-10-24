'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Building2,
  ArrowRight,
  UserCheck,
  Lock,
  Mail,
  User as UserIcon,
  Cloud,
  Layers,
} from 'lucide-react';

interface ResolvedAwsCustomer {
  customerIdentifier: string;
  productCode: string;
  customerAccountId?: string;
  dimension: string;
  quantity: number;
  expirationDate?: string;
  status: string;
  isClaimed: boolean;
  claimedBy?: { email: string; name: string } | null;
}

interface UserSession {
  userId: string;
  name: string;
  email: string;
  role: string;
}

function AwsMarketplaceActivationContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [customer, setCustomer] = useState<ResolvedAwsCustomer | null>(null);
  const [currentUser, setCurrentUser] = useState<UserSession | null>(null);

  // Authentication mode for non-logged-in users: 'login' | 'register'
  const [authMode, setAuthMode] = useState<'login' | 'register'>('register');

  // Login form state
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  // Register form state
  const [regName, setRegName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');

  const [activating, setActivating] = useState(false);
  const [activationSuccess, setActivationSuccess] = useState(false);

  // 1. Check current login session
  useEffect(() => {
    async function checkAuth() {
      try {
        const res = await fetch('/api/auth/me');
        if (res.ok) {
          const data = await res.json();
          if (data.authenticated && data.user) {
            setCurrentUser(data.user);
          }
        }
      } catch {
        // Ignore session fetch error
      }
    }
    checkAuth();
  }, []);

  // 2. Resolve registration token with AWS Marketplace API
  useEffect(() => {
    if (!token) {
      setLoading(false);
      setError(
        'No registration token was provided. Please launch this page by clicking "Set Up Your Account" in the AWS Marketplace console.'
      );
      return;
    }

    async function resolveToken() {
      try {
        setLoading(true);
        setError(null);

        const res = await fetch('/api/marketplace/aws/resolve', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        });

        const data = await res.json();

        if (!res.ok || !data.success) {
          throw new Error(data.error || 'Failed to resolve AWS registration token');
        }

        setCustomer(data.customer);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Failed to connect to AWS Marketplace';
        setError(msg);
      } finally {
        setLoading(false);
      }
    }

    resolveToken();
  }, [token]);

  // 3. Handle Login then Activate
  async function handleLoginAndActivate(e: React.FormEvent) {
    e.preventDefault();
    if (!customer) return;

    try {
      setActivating(true);
      setError(null);

      // Sign in first
      const loginRes = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: loginEmail, password: loginPassword }),
      });

      const loginData = await loginRes.json();
      if (!loginRes.ok || !loginData.success) {
        throw new Error(loginData.error || 'Invalid credentials');
      }

      // Activate subscription
      const actRes = await fetch('/api/marketplace/aws/activate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerIdentifier: customer.customerIdentifier,
          productCode: customer.productCode,
          customerAccountId: customer.customerAccountId,
          dimension: customer.dimension,
          quantity: customer.quantity,
        }),
      });

      const actData = await actRes.json();
      if (!actRes.ok || !actData.success) {
        throw new Error(actData.error || 'Failed to link AWS subscription');
      }

      setActivationSuccess(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Activation error';
      setError(msg);
    } finally {
      setActivating(false);
    }
  }

  // 4. Handle Register and Activate in one step
  async function handleRegisterAndActivate(e: React.FormEvent) {
    e.preventDefault();
    if (!customer) return;

    try {
      setActivating(true);
      setError(null);

      const actRes = await fetch('/api/marketplace/aws/activate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerIdentifier: customer.customerIdentifier,
          productCode: customer.productCode,
          customerAccountId: customer.customerAccountId,
          dimension: customer.dimension,
          quantity: customer.quantity,
          newAdmin: {
            name: regName,
            email: regEmail,
            password: regPassword,
          },
        }),
      });

      const actData = await actRes.json();
      if (!actRes.ok || !actData.success) {
        throw new Error(actData.error || 'Failed to activate AWS subscription');
      }

      setActivationSuccess(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Registration error';
      setError(msg);
    } finally {
      setActivating(false);
    }
  }

  // 5. Handle Activation for already logged in user
  async function handleLinkCurrentAccount() {
    if (!customer || !currentUser) return;

    try {
      setActivating(true);
      setError(null);

      const actRes = await fetch('/api/marketplace/aws/activate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerIdentifier: customer.customerIdentifier,
          productCode: customer.productCode,
          customerAccountId: customer.customerAccountId,
          dimension: customer.dimension,
          quantity: customer.quantity,
        }),
      });

      const actData = await actRes.json();
      if (!actRes.ok || !actData.success) {
        throw new Error(actData.error || 'Failed to link subscription');
      }

      setActivationSuccess(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Linking error';
      setError(msg);
    } finally {
      setActivating(false);
    }
  }

  // Success view
  if (activationSuccess) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
        <div className="sm:mx-auto sm:w-full sm:max-w-md">
          <div className="bg-white py-8 px-4 shadow-xl rounded-2xl sm:px-10 border border-slate-200 text-center">
            <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4 text-emerald-600">
              <CheckCircle2 className="w-10 h-10" />
            </div>
            <h2 className="text-2xl font-bold text-slate-900 mb-2">Subscription Activated!</h2>
            <p className="text-slate-600 mb-6 text-sm">
              Your AWS Marketplace subscription has been linked to your Global Minds Examination
              System administrator account.
            </p>

            <div className="bg-slate-50 rounded-lg p-4 border border-slate-200 text-left mb-6 text-xs space-y-1">
              <p>
                <span className="font-semibold text-slate-700">AWS Customer ID:</span>{' '}
                <span className="font-mono">{customer?.customerIdentifier}</span>
              </p>
              <p>
                <span className="font-semibold text-slate-700">Product Code:</span>{' '}
                <span className="font-mono">{customer?.productCode}</span>
              </p>
              <p>
                <span className="font-semibold text-slate-700">Tier / Dimension:</span>{' '}
                <span className="capitalize">{customer?.dimension}</span>
              </p>
              <p>
                <span className="font-semibold text-slate-700">Allocated Seats:</span>{' '}
                <span>{customer?.quantity}</span>
              </p>
            </div>

            <button
              onClick={() => router.push('/admin/dashboard')}
              className="w-full inline-flex justify-center items-center px-4 py-2.5 border border-transparent text-sm font-semibold rounded-lg text-white bg-indigo-600 hover:bg-indigo-700 shadow-sm transition"
            >
              Go to Admin Dashboard
              <ArrowRight className="w-4 h-4 ml-2" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-xl">
        <div className="text-center mb-6">
          <div className="inline-flex items-center space-x-2 bg-amber-500/10 text-amber-700 px-3 py-1.5 rounded-full text-xs font-semibold mb-3 border border-amber-500/20">
            <Cloud className="w-4 h-4 text-amber-600" />
            <span>AWS Marketplace SaaS Fulfillment</span>
          </div>
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">
            Activate Examination System SaaS
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            Link your AWS Marketplace purchase to your Global Minds Examination Portal account.
          </p>
        </div>

        <div className="bg-white py-8 px-6 shadow-xl rounded-2xl border border-slate-200 sm:px-10">
          {loading && (
            <div className="py-12 text-center">
              <Loader2 className="w-8 h-8 text-amber-600 animate-spin mx-auto mb-3" />
              <p className="text-sm font-medium text-slate-700">
                Verifying registration token with AWS Marketplace...
              </p>
            </div>
          )}

          {error && (
            <div className="mb-6 p-4 rounded-xl bg-red-50 border border-red-200 flex items-start space-x-3">
              <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
              <div className="text-sm text-red-800">
                <p className="font-semibold">Unable to process token</p>
                <p className="mt-0.5 text-xs text-red-700">{error}</p>
              </div>
            </div>
          )}

          {!loading && customer && (
            <div className="space-y-6">
              {/* Subscription Summary Badge */}
              <div className="bg-amber-50 rounded-xl p-4 border border-amber-200">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-bold text-slate-900 text-sm flex items-center">
                    <ShieldCheck className="w-4 h-4 text-amber-600 mr-1.5" />
                    AWS Purchase Verified
                  </h3>
                  <span className="text-xs px-2.5 py-0.5 rounded-full font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
                    Ready to Activate
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3 text-xs pt-2 border-t border-amber-200/60">
                  <div>
                    <span className="text-slate-500">Customer Identifier:</span>
                    <p className="font-mono font-medium text-slate-900 truncate">
                      {customer.customerIdentifier}
                    </p>
                  </div>
                  <div>
                    <span className="text-slate-500">Product Code:</span>
                    <p className="font-mono font-medium text-slate-900 truncate">
                      {customer.productCode}
                    </p>
                  </div>
                  <div>
                    <span className="text-slate-500">Plan / Dimension:</span>
                    <p className="font-medium text-slate-900 capitalize">{customer.dimension}</p>
                  </div>
                  <div>
                    <span className="text-slate-500">Candidate Capacity:</span>
                    <p className="font-medium text-slate-900">{customer.quantity} Seats</p>
                  </div>
                </div>
              </div>

              {/* Already Claimed Notice */}
              {customer.isClaimed && (
                <div className="p-4 rounded-xl bg-blue-50 border border-blue-200 text-xs text-blue-900">
                  <p className="font-semibold mb-1">Subscription Already Linked</p>
                  <p>
                    This subscription is already active and linked to{' '}
                    <span className="font-medium underline">{customer.claimedBy?.email}</span>.
                  </p>
                  <div className="mt-3">
                    <Link
                      href="/admin/dashboard"
                      className="inline-flex items-center font-semibold text-blue-700 hover:text-blue-800"
                    >
                      Go to Admin Portal <ArrowRight className="w-3.5 h-3.5 ml-1" />
                    </Link>
                  </div>
                </div>
              )}

              {/* Activation Options */}
              {!customer.isClaimed && (
                <div>
                  {currentUser ? (
                    <div className="bg-slate-50 p-5 rounded-xl border border-slate-200 space-y-4">
                      <div className="flex items-center space-x-3">
                        <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700">
                          <UserCheck className="w-5 h-5" />
                        </div>
                        <div>
                          <p className="text-xs text-slate-500">Signed in as Administrator</p>
                          <p className="text-sm font-bold text-slate-900">{currentUser.name}</p>
                          <p className="text-xs text-slate-600">{currentUser.email}</p>
                        </div>
                      </div>

                      <button
                        onClick={handleLinkCurrentAccount}
                        disabled={activating}
                        className="w-full py-2.5 px-4 rounded-lg bg-indigo-600 text-white font-semibold text-sm hover:bg-indigo-700 shadow-sm flex items-center justify-center transition disabled:opacity-50"
                      >
                        {activating ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Activating with AWS...
                          </>
                        ) : (
                          <>
                            Link Subscription to My Account
                            <ArrowRight className="w-4 h-4 ml-2" />
                          </>
                        )}
                      </button>
                    </div>
                  ) : (
                    <div>
                      {/* Tabs */}
                      <div className="flex border-b border-slate-200 mb-6">
                        <button
                          type="button"
                          onClick={() => setAuthMode('register')}
                          className={`flex-1 py-2.5 text-center text-sm font-semibold border-b-2 transition ${
                            authMode === 'register'
                              ? 'border-indigo-600 text-indigo-600'
                              : 'border-transparent text-slate-500 hover:text-slate-700'
                          }`}
                        >
                          New Organization Admin
                        </button>
                        <button
                          type="button"
                          onClick={() => setAuthMode('login')}
                          className={`flex-1 py-2.5 text-center text-sm font-semibold border-b-2 transition ${
                            authMode === 'login'
                              ? 'border-indigo-600 text-indigo-600'
                              : 'border-transparent text-slate-500 hover:text-slate-700'
                          }`}
                        >
                          Sign In & Link
                        </button>
                      </div>

                      {/* Register Form */}
                      {authMode === 'register' && (
                        <form onSubmit={handleRegisterAndActivate} className="space-y-4">
                          <div>
                            <label className="block text-xs font-semibold text-slate-700 mb-1">
                              Organization / Administrator Name
                            </label>
                            <div className="relative">
                              <UserIcon className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                              <input
                                type="text"
                                required
                                value={regName}
                                onChange={(e) => setRegName(e.target.value)}
                                placeholder="Global Minds Academy"
                                className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                              />
                            </div>
                          </div>

                          <div>
                            <label className="block text-xs font-semibold text-slate-700 mb-1">
                              Admin Email
                            </label>
                            <div className="relative">
                              <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                              <input
                                type="email"
                                required
                                value={regEmail}
                                onChange={(e) => setRegEmail(e.target.value)}
                                placeholder="admin@example.com"
                                className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                              />
                            </div>
                          </div>

                          <div>
                            <label className="block text-xs font-semibold text-slate-700 mb-1">
                              Set Password
                            </label>
                            <div className="relative">
                              <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                              <input
                                type="password"
                                required
                                minLength={6}
                                value={regPassword}
                                onChange={(e) => setRegPassword(e.target.value)}
                                placeholder="••••••••"
                                className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                              />
                            </div>
                          </div>

                          <button
                            type="submit"
                            disabled={activating}
                            className="w-full py-2.5 px-4 rounded-lg bg-indigo-600 text-white font-semibold text-sm hover:bg-indigo-700 shadow-sm flex items-center justify-center transition disabled:opacity-50 mt-2"
                          >
                            {activating ? (
                              <>
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                Provisioning & Activating...
                              </>
                            ) : (
                              <>
                                Create Admin Account & Activate
                                <ArrowRight className="w-4 h-4 ml-2" />
                              </>
                            )}
                          </button>
                        </form>
                      )}

                      {/* Login Form */}
                      {authMode === 'login' && (
                        <form onSubmit={handleLoginAndActivate} className="space-y-4">
                          <div>
                            <label className="block text-xs font-semibold text-slate-700 mb-1">
                              Administrator Email
                            </label>
                            <div className="relative">
                              <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                              <input
                                type="email"
                                required
                                value={loginEmail}
                                onChange={(e) => setLoginEmail(e.target.value)}
                                placeholder="admin@example.com"
                                className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                              />
                            </div>
                          </div>

                          <div>
                            <label className="block text-xs font-semibold text-slate-700 mb-1">
                              Password
                            </label>
                            <div className="relative">
                              <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                              <input
                                type="password"
                                required
                                value={loginPassword}
                                onChange={(e) => setLoginPassword(e.target.value)}
                                placeholder="••••••••"
                                className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                              />
                            </div>
                          </div>

                          <button
                            type="submit"
                            disabled={activating}
                            className="w-full py-2.5 px-4 rounded-lg bg-indigo-600 text-white font-semibold text-sm hover:bg-indigo-700 shadow-sm flex items-center justify-center transition disabled:opacity-50 mt-2"
                          >
                            {activating ? (
                              <>
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                Verifying & Linking...
                              </>
                            ) : (
                              <>
                                Sign In & Link Subscription
                                <ArrowRight className="w-4 h-4 ml-2" />
                              </>
                            )}
                          </button>
                        </form>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function AwsMarketplaceActivationPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-50 flex items-center justify-center">
          <Loader2 className="w-8 h-8 text-amber-600 animate-spin" />
        </div>
      }
    >
      <AwsMarketplaceActivationContent />
    </Suspense>
  );
}
