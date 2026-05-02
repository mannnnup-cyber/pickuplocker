'use client';

import { useState, useEffect } from 'react';

interface SavedCard {
  id: string;
  brand: string | null;
  last4: string | null;
  expiryMonth: string | null;
  expiryYear: string | null;
  isDefault: boolean;
  lastUsedAt: string | null;
}

interface AccountData {
  user: {
    name: string | null;
    phone: string | null;
    email: string | null;
  };
  savedCards: SavedCard[];
  orders: {
    id: string;
    orderNumber: string;
    status: string;
    packageSize: string | null;
    storageFee: number;
    createdAt: string;
  }[];
}

export default function AccountPage() {
  const [phone, setPhone] = useState('');
  const [data, setData] = useState<AccountData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<'cards' | 'orders'>('cards');

  // Check URL for phone parameter (from SMS links)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const phoneParam = params.get('phone');
    if (phoneParam) {
      setPhone(phoneParam);
      loadAccount(phoneParam);
    }
  }, []);

  async function loadAccount(phoneNumber: string) {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/account?phone=${encodeURIComponent(phoneNumber)}`);
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to load account');
      }
      const accountData = await res.json();
      setData(accountData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load account');
    } finally {
      setLoading(false);
    }
  }

  async function removeCard(cardId: string) {
    if (!confirm('Remove this saved card?')) return;
    try {
      const res = await fetch('/api/account/cards', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cardId }),
      });
      if (res.ok && data) {
        setData({ ...data, savedCards: data.savedCards.filter(c => c.id !== cardId) });
      }
    } catch {
      // ignore
    }
  }

  async function setDefaultCard(cardId: string) {
    try {
      const res = await fetch('/api/account/cards', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cardId, isDefault: true }),
      });
      if (res.ok && data) {
        setData({
          ...data,
          savedCards: data.savedCards.map(c => ({
            ...c,
            isDefault: c.id === cardId,
          })),
        });
      }
    } catch {
      // ignore
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (phone.trim()) {
      loadAccount(phone.trim());
    }
  }

  const brandIcons: Record<string, string> = {
    VISA: '💳',
    MASTERCARD: '💳',
    DISCOVER: '💳',
    AMEX: '💳',
  };

  return (
    <div className="min-h-screen bg-[#111111] text-white">
      {/* Header */}
      <div className="bg-[#FFD439] text-[#111111] p-6 text-center">
        <h1 className="text-3xl font-bold tracking-wider">PICKUP</h1>
        <p className="text-sm mt-1">Smart Locker System — My Account</p>
      </div>

      <div className="max-w-lg mx-auto px-4 py-6">
        {/* Phone lookup form */}
        {!data && (
          <div className="bg-[#1a1a1a] rounded-xl p-6 border border-[#333]">
            <h2 className="text-xl font-bold text-[#FFD439] mb-4">Find Your Account</h2>
            <p className="text-[#999] mb-4 text-sm">
              Enter the phone number you used at the locker to view your account, saved cards, and orders.
            </p>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm text-[#FFD439] font-bold mb-1">Phone Number</label>
                <input
                  type="tel"
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  placeholder="876-XXX-XXXX"
                  className="w-full p-3 bg-[#111] border-2 border-[#333] rounded-lg text-white text-lg focus:border-[#FFD439] focus:outline-none"
                  required
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 bg-[#FFD439] text-[#111] font-bold text-lg rounded-lg hover:bg-[#e6c035] disabled:opacity-50"
              >
                {loading ? 'Loading...' : 'Find Account'}
              </button>
            </form>
            {error && <p className="text-red-400 mt-4 text-center">{error}</p>}
          </div>
        )}

        {/* Account data */}
        {data && (
          <>
            {/* User info */}
            <div className="bg-[#1a1a1a] rounded-xl p-6 border border-[#333] mb-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-bold">{data.user.name || 'Customer'}</h2>
                  <p className="text-[#999] text-sm">{data.user.phone}</p>
                  {data.user.email && !data.user.email.includes('@pickup.local') && (
                    <p className="text-[#999] text-sm">{data.user.email}</p>
                  )}
                </div>
                <button
                  onClick={() => { setData(null); setPhone(''); }}
                  className="text-[#999] text-sm hover:text-white"
                >
                  Switch Account
                </button>
              </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-2 mb-4">
              <button
                onClick={() => setActiveTab('cards')}
                className={`flex-1 py-2 rounded-lg font-bold text-sm ${
                  activeTab === 'cards' ? 'bg-[#FFD439] text-[#111]' : 'bg-[#1a1a1a] text-[#999] border border-[#333]'
                }`}
              >
                Saved Cards ({data.savedCards.length})
              </button>
              <button
                onClick={() => setActiveTab('orders')}
                className={`flex-1 py-2 rounded-lg font-bold text-sm ${
                  activeTab === 'orders' ? 'bg-[#FFD439] text-[#111]' : 'bg-[#1a1a1a] text-[#999] border border-[#333]'
                }`}
              >
                Orders ({data.orders.length})
              </button>
            </div>

            {/* Saved Cards tab */}
            {activeTab === 'cards' && (
              <div className="space-y-3">
                {data.savedCards.length === 0 ? (
                  <div className="bg-[#1a1a1a] rounded-xl p-6 border border-[#333] text-center">
                    <p className="text-[#999]">No saved cards yet.</p>
                    <p className="text-[#666] text-sm mt-2">
                      Your card will be automatically saved the next time you pay via QR at the locker.
                    </p>
                  </div>
                ) : (
                  data.savedCards.map(card => (
                    <div
                      key={card.id}
                      className="bg-[#1a1a1a] rounded-xl p-4 border border-[#333]"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <span className="text-2xl">{brandIcons[card.brand || ''] || '💳'}</span>
                          <div>
                            <p className="font-bold">
                              {card.brand || 'Card'} ****{card.last4 || '****'}
                              {card.isDefault && (
                                <span className="ml-2 text-xs bg-[#FFD439] text-[#111] px-2 py-0.5 rounded-full">
                                  Default
                                </span>
                              )}
                            </p>
                            <p className="text-[#999] text-sm">
                              Expires {card.expiryMonth || '??'}/{card.expiryYear?.slice(-2) || '??'}
                              {card.lastUsedAt && (
                                <span className="ml-2">
                                  · Last used {new Date(card.lastUsedAt).toLocaleDateString()}
                                </span>
                              )}
                            </p>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          {!card.isDefault && (
                            <button
                              onClick={() => setDefaultCard(card.id)}
                              className="text-xs text-[#FFD439] hover:underline"
                            >
                              Set Default
                            </button>
                          )}
                          <button
                            onClick={() => removeCard(card.id)}
                            className="text-xs text-red-400 hover:underline"
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
                <div className="bg-[#1a1a1a] rounded-xl p-4 border border-[#333] border-dashed">
                  <p className="text-[#999] text-sm text-center">
                    To add a new card, pay via QR at the locker. Your card will be saved automatically for faster checkout next time.
                  </p>
                </div>
              </div>
            )}

            {/* Orders tab */}
            {activeTab === 'orders' && (
              <div className="space-y-3">
                {data.orders.length === 0 ? (
                  <div className="bg-[#1a1a1a] rounded-xl p-6 border border-[#333] text-center">
                    <p className="text-[#999]">No orders found.</p>
                  </div>
                ) : (
                  data.orders.map(order => (
                    <div
                      key={order.id}
                      className="bg-[#1a1a1a] rounded-xl p-4 border border-[#333]"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-bold text-sm">#{order.orderNumber}</span>
                        <span
                          className={`text-xs px-2 py-0.5 rounded-full ${
                            order.status === 'PICKED_UP'
                              ? 'bg-green-900 text-green-300'
                              : order.status === 'STORED'
                              ? 'bg-blue-900 text-blue-300'
                              : 'bg-yellow-900 text-yellow-300'
                          }`}
                        >
                          {order.status.replace(/_/g, ' ')}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-sm text-[#999]">
                        <span>Size: {order.packageSize || 'N/A'}</span>
                        {order.storageFee > 0 && (
                          <span className="text-[#FFD439]">Fee: ${order.storageFee} JMD</span>
                        )}
                      </div>
                      <p className="text-xs text-[#666] mt-1">
                        Created: {new Date(order.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                  ))
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
