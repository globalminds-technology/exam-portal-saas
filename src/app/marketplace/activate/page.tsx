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
  Layers,
  ArrowRight,
  UserCheck,
  Lock,
  Mail,
  User as UserIcon,
} from 'lucide-react';

interface ResolvedSub {
  id: string;
  subscriptionName: string;
  offerId: string;
  planId: string;
  quantity: number;
  status: string;
  beneficiary?: { email?: string; tenantId?: string };
  purchaser?: { email?: string; tenantId?: string };
  term?: { termUnit?: string };
  isClaimed: boolean;
  claimedBy?: { email: string; name: string } | null;
}

interface UserSession {
  userId: string;
  name: string;
  email: string;
  role: string;
}

function MarketplaceActivationContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [subscription, setSubscription] = useState<ResolvedSub | null>(null);
  const [currentUser, setCurrentUser] = useState<UserSession | null>(null);

  // Authentication mode for non-logged-in users: 'login' | 'register'
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');

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

  // 2. Resolve purchase token with Microsoft SaaS API
  useEffect(() => {
    if (!token) {
      setLoading(false);
      setError('No purchase token was provided. Please launch this page through the Azure Marketplace Portal or AppSource.');
      return;
    }

    async function resolveToken() {
      try {
        setLoading(true);
        setError(null);

        const res = await fetch('/api/marketplace/resolve', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        });

        const data = await res.json();

        if (!res.ok || !data.success) {
          throw new Error(data.error || 'Failed to resolve purchase token');
        }

        setSubscription(data.subscription);
        if (data.subscription?.purchaser?.email) {
          setRegEmail(data.subscription.purchaser.email);
          setLoginEmail(data.subscription.purchaser.email);
        }
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Failed to connect to Microsoft Marketplace service.');
      } finally {
        setLoading(false);
      }
    }

    resolveToken();
  }, [token]);

  // Handle direct activation for authenticated user
  const handleActivateForCurrentUser = async () => {
    if (!subscription) return;
    setActivating(true);
    setError(null);

    try {
      const res = await fetch('/api/marketplace/activate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subscriptionId: subscription.id,
          planId: subscription.planId,
          quantity: subscription.quantity,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Activation failed');
      }

      setActivationSuccess(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Activation failed');
    } finally {
      setActivating(false);
    }
  };

  // Handle sign-in & activation
  const handleLoginAndActivate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subscription) return;
    setActivating(true);
    setError(null);

    try {
      // 1. Sign in
      const loginRes = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: loginEmail, password: loginPassword }),
      });

      const loginData = await loginRes.json();
      if (!loginRes.ok || !loginData.success) {
        throw new Error(loginData.error || 'Invalid credentials');
      }

      // 2. Activate subscription
      const actRes = await fetch('/api/marketplace/activate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subscriptionId: subscription.id,
          planId: subscription.planId,
          quantity: subscription.quantity,
        }),
      });

      const actData = await actRes.json();
      if (!actRes.ok || !actData.success) {
        throw new Error(actData.error || 'Failed to activate subscription after sign in');
      }

      setActivationSuccess(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error during activation');
    } finally {
      setActivating(false);
    }
  };

  // Handle registration & activation
  const handleRegisterAndActivate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subscription) return;
    setActivating(true);
    setError(null);

    try {
      const actRes = await fetch('/api/marketplace/activate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subscriptionId: subscription.id,
          planId: subscription.planId,
          quantity: subscription.quantity,
          newAdmin: {
            name: regName,
            email: regEmail,
            password: regPassword,
          },
        }),
      });

      const actData = await actRes.json();
      if (!actRes.ok || !actData.success) {
        throw new Error(actData.error || 'Failed to provision organization admin account');
      }

      setActivationSuccess(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error during account creation and activation');
    } finally {
      setActivating(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 py-12 px-4 sm:px-6 lg:px-8 flex flex-col justify-center">
      <div className="max-w-xl w-full mx-auto space-y-8">
        {/* Marketplace Brand Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center space-x-2 px-3.5 py-1.5 rounded-full bg-blue-50 border border-blue-200 text-blue-700 text-xs font-semibold">
            <ShieldCheck className="w-4 h-4 text-blue-600" />
            <span>Microsoft Azure Marketplace Verified SaaS</span>
          </div>
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">
            Activate Your Subscription
          </h1>
          <p className="text-sm text-slate-500">
            Link your Azure Marketplace purchase to your Examination Platform account.
          </p>
        </div>

        {/* Loading State */}
        {loading && (
          <div className="bg-white rounded-3xl p-10 border border-slate-200 shadow-sm text-center space-y-4">
            <Loader2 className="w-10 h-10 animate-spin text-blue-600 mx-auto" />
            <div className="space-y-1">
              <h2 className="text-lg font-bold text-slate-800">Resolving Purchase Token</h2>
              <p className="text-xs text-slate-500">Communicating with Microsoft Marketplace SaaS Fulfillment API...</p>
            </div>
          </div>
        )}

        {/* Error Notification */}
        {error && (
          <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-sm flex items-start space-x-3">
            <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-semibold">Unable to Complete Request</p>
              <p className="text-xs text-rose-700 mt-0.5">{error}</p>
            </div>
          </div>
        )}

        {/* Success Confirmation Card */}
        {activationSuccess && (
          <div className="bg-white rounded-3xl p-8 border border-emerald-200 shadow-lg text-center space-y-6">
            <div className="w-16 h-16 rounded-2xl bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto shadow-inner">
              <CheckCircle2 className="w-9 h-9" />
            </div>

            <div className="space-y-2">
              <h2 className="text-2xl font-extrabold text-slate-900">Subscription Activated!</h2>
              <p className="text-sm text-slate-600 max-w-sm mx-auto">
                Your Microsoft Azure Marketplace subscription is now fulfilled and linked to your organization.
              </p>
            </div>

            <div className="pt-2">
              <Link
                href="/admin/dashboard"
                className="w-full inline-flex items-center justify-center px-6 py-3.5 rounded-xl font-bold text-white bg-blue-600 hover:bg-blue-700 shadow-md shadow-blue-500/20 transition-all space-x-2 text-sm"
              >
                <span>Go to Admin Dashboard</span>
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
        )}

        {/* Subscription Fulfillment Card */}
        {!loading && !activationSuccess && subscription && (
          <div className="bg-white rounded-3xl border border-slate-200 shadow-xl overflow-hidden">
            {/* Purchase Summary Header */}
            <div className="p-6 sm:p-8 bg-slate-900 text-white space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold tracking-wide text-blue-400 uppercase">
                  Order Details
                </span>
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  {subscription.status}
                </span>
              </div>

              <div>
                <h2 className="text-xl sm:text-2xl font-bold text-white">
                  {subscription.subscriptionName || 'Examination Platform SaaS'}
                </h2>
                <p className="text-xs text-slate-400 mt-1">Offer ID: {subscription.offerId}</p>
              </div>

              <div className="grid grid-cols-2 gap-4 pt-2 border-t border-slate-800 text-xs">
                <div>
                  <span className="text-slate-400">Plan Tier:</span>
                  <p className="font-semibold text-white capitalize">{subscription.planId}</p>
                </div>
                <div>
                  <span className="text-slate-400">Billing Term:</span>
                  <p className="font-semibold text-white">{subscription.term?.termUnit || 'Monthly'}</p>
                </div>
              </div>
            </div>

            {/* Account Linking & Fulfillment Form */}
            <div className="p-6 sm:p-8 space-y-6">
              {currentUser ? (
                // State A: User is already signed in
                <div className="space-y-6">
                  <div className="p-4 rounded-2xl bg-blue-50/70 border border-blue-200 flex items-start space-x-3">
                    <UserCheck className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-xs text-blue-600 font-semibold uppercase">Linked Account</p>
                      <p className="text-sm font-bold text-slate-900">{currentUser.name}</p>
                      <p className="text-xs text-slate-500">{currentUser.email} ({currentUser.role})</p>
                    </div>
                  </div>

                  <button
                    onClick={handleActivateForCurrentUser}
                    disabled={activating}
                    className="w-full inline-flex items-center justify-center px-6 py-3.5 rounded-xl font-bold text-white bg-blue-600 hover:bg-blue-700 shadow-md shadow-blue-500/20 transition-all space-x-2 text-sm disabled:opacity-50"
                  >
                    {activating ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Activating with Microsoft...</span>
                      </>
                    ) : (
                      <>
                        <span>Confirm & Activate Subscription</span>
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </button>
                </div>
              ) : (
                // State B: User must sign in or register organization admin
                <div className="space-y-6">
                  <div className="flex rounded-xl bg-slate-100 p-1">
                    <button
                      type="button"
                      onClick={() => setAuthMode('login')}
                      className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${
                        authMode === 'login'
                          ? 'bg-white text-slate-900 shadow-sm'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Sign In to Existing Admin Account
                    </button>
                    <button
                      type="button"
                      onClick={() => setAuthMode('register')}
                      className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${
                        authMode === 'register'
                          ? 'bg-white text-slate-900 shadow-sm'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Create Organization Account
                    </button>
                  </div>

                  {authMode === 'login' ? (
                    <form onSubmit={handleLoginAndActivate} className="space-y-4">
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                          Administrator Email
                        </label>
                        <div className="relative">
                          <Mail className="w-4 h-4 absolute left-3.5 top-3.5 text-slate-400" />
                          <input
                            type="email"
                            required
                            value={loginEmail}
                            onChange={(e) => setLoginEmail(e.target.value)}
                            placeholder="admin@organization.com"
                            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                          Password
                        </label>
                        <div className="relative">
                          <Lock className="w-4 h-4 absolute left-3.5 top-3.5 text-slate-400" />
                          <input
                            type="password"
                            required
                            value={loginPassword}
                            onChange={(e) => setLoginPassword(e.target.value)}
                            placeholder="••••••••"
                            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                      </div>

                      <button
                        type="submit"
                        disabled={activating}
                        className="w-full inline-flex items-center justify-center px-6 py-3.5 rounded-xl font-bold text-white bg-blue-600 hover:bg-blue-700 shadow-md shadow-blue-500/20 transition-all space-x-2 text-sm disabled:opacity-50 mt-2"
                      >
                        {activating ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            <span>Authenticating & Activating...</span>
                          </>
                        ) : (
                          <>
                            <span>Sign In & Activate</span>
                            <ArrowRight className="w-4 h-4" />
                          </>
                        )}
                      </button>
                    </form>
                  ) : (
                    <form onSubmit={handleRegisterAndActivate} className="space-y-4">
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                          Full Name / Organization Lead
                        </label>
                        <div className="relative">
                          <UserIcon className="w-4 h-4 absolute left-3.5 top-3.5 text-slate-400" />
                          <input
                            type="text"
                            required
                            value={regName}
                            onChange={(e) => setRegName(e.target.value)}
                            placeholder="John Doe"
                            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                          Organization Email
                        </label>
                        <div className="relative">
                          <Mail className="w-4 h-4 absolute left-3.5 top-3.5 text-slate-400" />
                          <input
                            type="email"
                            required
                            value={regEmail}
                            onChange={(e) => setRegEmail(e.target.value)}
                            placeholder="lead@company.com"
                            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                          Create Password
                        </label>
                        <div className="relative">
                          <Lock className="w-4 h-4 absolute left-3.5 top-3.5 text-slate-400" />
                          <input
                            type="password"
                            required
                            minLength={6}
                            value={regPassword}
                            onChange={(e) => setRegPassword(e.target.value)}
                            placeholder="At least 6 characters"
                            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                      </div>

                      <button
                        type="submit"
                        disabled={activating}
                        className="w-full inline-flex items-center justify-center px-6 py-3.5 rounded-xl font-bold text-white bg-blue-600 hover:bg-blue-700 shadow-md shadow-blue-500/20 transition-all space-x-2 text-sm disabled:opacity-50 mt-2"
                      >
                        {activating ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            <span>Creating Account & Activating...</span>
                          </>
                        ) : (
                          <>
                            <span>Register & Activate</span>
                            <ArrowRight className="w-4 h-4" />
                          </>
                        )}
                      </button>
                    </form>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function MarketplaceActivatePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-50 flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
        </div>
      }
    >
      <MarketplaceActivationContent />
    </Suspense>
  );
}
