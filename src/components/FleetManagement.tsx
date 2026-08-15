import { useState, useEffect } from 'react';
import { Truck, Plus, Trash2, Car, User } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { Card, Button, Input, Field, EmptyState, formatIDR } from './ui-shared';
import { uid } from '../lib/utils';
import { supabase } from '../lib/supabase';
import type { Vehicle, Driver } from '../lib/types';

export function FleetManagement() {
  const { vehicles, drivers, showToast, refresh } = useApp();
  const [showAddV, setShowAddV] = useState(false);
  const [showAddD, setShowAddD] = useState(false);
  const [newV, setNewV] = useState({ plate_number: '', vehicle_type: '', current_km: 0, fuel_monthly_cost: 0, assigned_driver: '' });
  const [newD, setNewD] = useState({ name: '', license_number: '', phone: '', assigned_vehicle: '' });

  const addVehicle = async () => {
    if (!newV.plate_number.trim()) { showToast('error', 'Plat nomor wajib diisi'); return; }
    const { error } = await supabase.from('vehicles').insert({ id: uid(), plate_number: newV.plate_number, vehicle_type: newV.vehicle_type, status: 'available', current_km: newV.current_km, fuel_monthly_cost: newV.fuel_monthly_cost, assigned_driver: newV.assigned_driver || null });
    if (error) { showToast('error', 'Gagal: ' + error.message); return; }
    showToast('success', 'Kendaraan ditambahkan');
    setShowAddV(false);
    setNewV({ plate_number: '', vehicle_type: '', current_km: 0, fuel_monthly_cost: 0, assigned_driver: '' });
    refresh();
  };

  const addDriver = async () => {
    if (!newD.name.trim()) { showToast('error', 'Nama driver wajib diisi'); return; }
    const { error } = await supabase.from('drivers').insert({ id: uid(), name: newD.name, license_number: newD.license_number || null, phone: newD.phone || null, status: 'available', assigned_vehicle: newD.assigned_vehicle || null });
    if (error) { showToast('error', 'Gagal: ' + error.message); return; }
    showToast('success', 'Driver ditambahkan');
    setShowAddD(false);
    setNewD({ name: '', license_number: '', phone: '', assigned_vehicle: '' });
    refresh();
  };

  const deleteVehicle = async (id: string) => {
    if (!confirm('Hapus kendaraan ini?')) return;
    await supabase.from('vehicles').delete().eq('id', id);
    showToast('success', 'Kendaraan dihapus');
    refresh();
  };

  const deleteDriver = async (id: string) => {
    if (!confirm('Hapus driver ini?')) return;
    await supabase.from('drivers').delete().eq('id', id);
    showToast('success', 'Driver dihapus');
    refresh();
  };

  return (
    <div className="space-y-6 animate-slide-up max-w-5xl mx-auto">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-sky-50 flex items-center justify-center text-sky-600"><Truck className="w-5 h-5" /></div>
        <div className="flex-1">
          <h2 className="text-xl font-bold text-slate-900">Fleet Management</h2>
          <p className="text-sm text-slate-500">Manajemen armada kendaraan & driver</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" icon={<Car className="w-4 h-4" />} onClick={() => setShowAddV(true)}>Add Vehicle</Button>
          <Button variant="secondary" icon={<User className="w-4 h-4" />} onClick={() => setShowAddD(true)}>Add Driver</Button>
        </div>
      </div>

      <Card className="p-6">
        <h3 className="text-sm font-bold text-slate-800 mb-3">Kendaraan Dinas</h3>
        {vehicles.length === 0 ? <EmptyState icon={<Truck className="w-6 h-6" />} title="Belum ada kendaraan" /> : (
          <div className="space-y-2">
            {vehicles.map((v) => (
              <div key={v.id} className="flex items-center justify-between rounded-xl ring-1 ring-slate-100 p-3">
                <div>
                  <div className="text-sm font-semibold text-slate-800">{v.plate_number}</div>
                  <div className="text-xs text-slate-400">{v.vehicle_type} · KM: {v.current_km ?? 0} · Driver: {v.assigned_driver ?? '-'}</div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-slate-500">{formatIDR(Number(v.fuel_monthly_cost) || 0)}/bln</span>
                  <button onClick={() => deleteVehicle(v.id)} className="text-rose-400 hover:text-rose-600"><Trash2 className="w-4 h-4" /></button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card className="p-6">
        <h3 className="text-sm font-bold text-slate-800 mb-3">Driver</h3>
        {drivers.length === 0 ? <EmptyState icon={<User className="w-6 h-6" />} title="Belum ada driver" /> : (
          <div className="space-y-2">
            {drivers.map((d) => (
              <div key={d.id} className="flex items-center justify-between rounded-xl ring-1 ring-slate-100 p-3">
                <div>
                  <div className="text-sm font-semibold text-slate-800">{d.name}</div>
                  <div className="text-xs text-slate-400">{d.license_number ?? '-'} · {d.phone ?? '-'} · {d.assigned_vehicle ?? '-'}</div>
                </div>
                <button onClick={() => deleteDriver(d.id)} className="text-rose-400 hover:text-rose-600"><Trash2 className="w-4 h-4" /></button>
              </div>
            ))}
          </div>
        )}
      </Card>

      {showAddV && (
        <Card className="p-6 space-y-4">
          <h3 className="text-sm font-bold text-slate-800">Add Vehicle</h3>
          <div className="grid md:grid-cols-2 gap-4">
            <Field label="Plat Nomor" required><Input value={newV.plate_number} onChange={(e) => setNewV({ ...newV, plate_number: e.target.value })} placeholder="B 1234 ABC" /></Field>
            <Field label="Jenis Kendaraan"><Input value={newV.vehicle_type} onChange={(e) => setNewV({ ...newV, vehicle_type: e.target.value })} placeholder="Toyota Innova" /></Field>
            <Field label="KM Awal"><Input type="number" value={newV.current_km} onChange={(e) => setNewV({ ...newV, current_km: parseInt(e.target.value) || 0 })} /></Field>
            <Field label="Fuel Cost/Bulan"><Input type="number" value={newV.fuel_monthly_cost} onChange={(e) => setNewV({ ...newV, fuel_monthly_cost: parseFloat(e.target.value) || 0 })} /></Field>
            <Field label="Assigned Driver"><Input value={newV.assigned_driver} onChange={(e) => setNewV({ ...newV, assigned_driver: e.target.value })} /></Field>
          </div>
          <div className="flex gap-2 justify-end"><Button variant="secondary" size="sm" onClick={() => setShowAddV(false)}>Cancel</Button><Button size="sm" onClick={addVehicle}>Add</Button></div>
        </Card>
      )}

      {showAddD && (
        <Card className="p-6 space-y-4">
          <h3 className="text-sm font-bold text-slate-800">Add Driver</h3>
          <div className="grid md:grid-cols-2 gap-4">
            <Field label="Nama" required><Input value={newD.name} onChange={(e) => setNewD({ ...newD, name: e.target.value })} /></Field>
            <Field label="License Number"><Input value={newD.license_number} onChange={(e) => setNewD({ ...newD, license_number: e.target.value })} /></Field>
            <Field label="Phone"><Input value={newD.phone} onChange={(e) => setNewD({ ...newD, phone: e.target.value })} /></Field>
            <Field label="Assigned Vehicle"><Input value={newD.assigned_vehicle} onChange={(e) => setNewD({ ...newD, assigned_vehicle: e.target.value })} placeholder="Plat nomor" /></Field>
          </div>
          <div className="flex gap-2 justify-end"><Button variant="secondary" size="sm" onClick={() => setShowAddD(false)}>Cancel</Button><Button size="sm" onClick={addDriver}>Add</Button></div>
        </Card>
      )}
    </div>
  );
}

void useEffect;
