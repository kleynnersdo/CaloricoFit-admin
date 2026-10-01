import { useEffect, useState } from 'react';
import { api } from '../../lib/apiClient';
import { emptyToNull } from '../../lib/utils';
import * as XLSX from 'xlsx';
import { Download, Edit, Plus, Trash2 } from 'lucide-react';
import Modal from '../ui/Modal';
import ConfirmModal from '../ui/ConfirmModal';
import { Table, TableHeader, TableHeaderCell, TableBody, TableCell } from '../ui/Table';

interface CustomersTabProps {
  showToast: (msg: string) => void;
}

const emptyCustomerForm = { document_id: '', first_name: '', last_name: '', phone: '', email: '', city: '', loyalty_points: 0 };

// Base de datos de clientes (CRM): búsqueda, puntos de fidelidad y exportación Excel.
export default function CustomersTab({ showToast }: CustomersTabProps) {
  const [customers, setCustomers] = useState<any[]>([]);
  const [customerSearch, setCustomerSearch] = useState("");
  const [customerFilterPoints, setCustomerFilterPoints] = useState(false);

  useEffect(() => {
    fetchCustomers();
  }, []);

  const fetchCustomers = async () => {
    const { data } = await api.from('customers').select('*');
    if (data) setCustomers(data);
  };

  const exportCustomers = () => {
    if(customers.length === 0) {
      showToast("No hay clientes para exportar.");
      return;
    }
    const ws = XLSX.utils.json_to_sheet(customers.map(c => ({
        'Cédula': c.document_id,
        'Nombres': c.first_name,
        'Apellidos': c.last_name,
        'Teléfono': c.phone,
        'Email': c.email,
        'Puntos de Fidelidad': c.loyalty_points,
        'Fecha Registro': new Date(c.created_at).toLocaleDateString()
    })));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Clientes");
    XLSX.writeFile(wb, "Base_Datos_Clientes.xlsx");
  };

  // Modal Cliente
  const [isAdminCustomerModalOpen, setIsAdminCustomerModalOpen] = useState(false);
  const [customerForm, setCustomerForm] = useState<any>({ ...emptyCustomerForm });

  // Modal Eliminar Cliente
  const [customerToDelete, setCustomerToDelete] = useState<any>(null);
  const [isDeleteCustomerModalOpen, setIsDeleteCustomerModalOpen] = useState(false);

  const handleSaveCustomer = async () => {
    const documentId = String(customerForm.document_id || '').trim().toUpperCase();
    const firstName = String(customerForm.first_name || '').trim();
    const lastName = String(customerForm.last_name || '').trim();
    const phone = String(customerForm.phone || '').trim();
    if (!documentId || !firstName || !lastName) {
      showToast("Cédula, nombre y apellido son obligatorios.");
      return;
    }
    if (!phone) {
      showToast("El teléfono es obligatorio.");
      return;
    }
    const payload = {
      document_id: documentId,
      first_name: firstName,
      last_name: lastName,
      phone,
      email: emptyToNull(customerForm.email),
      city: emptyToNull(customerForm.city),
      loyalty_points: Math.max(0, Number(customerForm.loyalty_points) || 0),
    };
    if (customerForm.id) {
      const { error } = await api.from('customers').update(payload).eq('id', customerForm.id);
      if (error) {
        showToast("Error actualizando cliente: " + error.message);
        return;
      }
      showToast("Cliente actualizado.");
    } else {
      const { error } = await api.from('customers').insert([payload]);
      if (error) {
        showToast("Error creando cliente: " + (error.message.includes('unique') || error.message.includes('duplicate') ? 'Esa cédula ya está registrada.' : error.message));
        return;
      }
      showToast("Cliente creado.");
    }
    setIsAdminCustomerModalOpen(false);
    setCustomerForm({ ...emptyCustomerForm });
    fetchCustomers();
  };

  const handleConfirmDeleteCustomer = async () => {
    if (!customerToDelete) return;
    const { error } = await api.from('customers').delete().eq('id', customerToDelete.id);
    if (error) {
      showToast("No se pudo eliminar. Si el cliente tiene ventas, anúlalas o consérvalo en el CRM.");
      return;
    }
    showToast("Cliente eliminado.");
    setIsDeleteCustomerModalOpen(false);
    setCustomerToDelete(null);
    fetchCustomers();
  };

  const filteredCustomers = customers
    .filter(c =>
      `${c.first_name} ${c.last_name} ${c.document_id} ${c.city || ''}`.toLowerCase().includes(customerSearch.toLowerCase())
    )
    .sort((a, b) => customerFilterPoints ? b.loyalty_points - a.loyalty_points : new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  return (
    <>
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
         <h2 className="text-2xl font-bold text-gray-900">Base de Datos de Clientes</h2>
         <div className="flex gap-2 w-full md:w-auto">
           <input
             type="text"
             placeholder="Buscar por cédula, nombre..."
             className="px-4 py-2 border border-gray-300 rounded-lg outline-none focus:border-black flex-1 md:w-64"
             value={customerSearch}
             onChange={e => setCustomerSearch(e.target.value)}
           />
           <button
             onClick={() => setCustomerFilterPoints(!customerFilterPoints)}
             className={`px-4 py-2 rounded-lg font-medium border ${customerFilterPoints ? 'bg-orange-50 border-orange-200 text-orange-700' : 'bg-white border-gray-300 text-gray-600'}`}
             title="Ordenar por Puntos"
           >
             🌟
           </button>
           <button
             onClick={() => { setCustomerForm({ ...emptyCustomerForm }); setIsAdminCustomerModalOpen(true); }}
             className="bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-lg font-medium flex items-center gap-2"
           >
             <Plus className="w-5 h-5"/> Cliente
           </button>
           <button
             onClick={exportCustomers}
             className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg font-medium flex items-center gap-2 transition-colors"
           >
             <Download className="w-5 h-5"/> Exportar (Excel)
           </button>
         </div>
      </div>
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden mb-6">
        <Table>
          <TableHeader>
            <tr>
              <TableHeaderCell>Cliente</TableHeaderCell>
              <TableHeaderCell>Cédula</TableHeaderCell>
              <TableHeaderCell>Contacto / Ciudad</TableHeaderCell>
              <TableHeaderCell className="text-center">Puntos Fidelidad</TableHeaderCell>
              <TableHeaderCell className="text-center">Acciones</TableHeaderCell>
            </tr>
          </TableHeader>
          <TableBody>
            {filteredCustomers.map(c => (
              <tr key={c.id}>
                <TableCell className="font-bold">{c.first_name} {c.last_name}</TableCell>
                <TableCell className="font-mono text-gray-500">{c.document_id}</TableCell>
                <TableCell className="text-sm text-gray-500">{c.phone}<br/>{c.email} {c.city ? `• ${c.city}` : ''}</TableCell>
                <TableCell className="text-center font-bold text-orange-600">{c.loyalty_points} 🌟</TableCell>
                <TableCell className="text-center">
                  <button onClick={() => { setCustomerForm({ ...c, loyalty_points: c.loyalty_points || 0 }); setIsAdminCustomerModalOpen(true); }} className="text-blue-500 hover:text-blue-700 mx-2" title="Editar"><Edit className="w-4 h-4"/></button>
                  <button onClick={() => { setCustomerToDelete(c); setIsDeleteCustomerModalOpen(true); }} className="text-red-500 hover:text-red-700 mx-2" title="Eliminar"><Trash2 className="w-4 h-4"/></button>
                </TableCell>
              </tr>
            ))}
            {filteredCustomers.length === 0 && <tr><td colSpan={5} className="p-8 text-center text-gray-500">No se encontraron clientes.</td></tr>}
          </TableBody>
        </Table>
      </div>

      {isAdminCustomerModalOpen && (
        <Modal title={customerForm.id ? 'Editar Cliente' : 'Nuevo Cliente'} onClose={() => setIsAdminCustomerModalOpen(false)} headerClassName="border-b" bodyClassName="p-4 space-y-3">
          <div><label className="block text-sm font-medium mb-1">Cédula</label><input className="w-full px-3 py-2 border rounded font-mono" value={customerForm.document_id} onChange={e => setCustomerForm({...customerForm, document_id: e.target.value})} disabled={!!customerForm.id} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-sm font-medium mb-1">Nombre</label><input className="w-full px-3 py-2 border rounded" value={customerForm.first_name} onChange={e => setCustomerForm({...customerForm, first_name: e.target.value})} /></div>
            <div><label className="block text-sm font-medium mb-1">Apellido</label><input className="w-full px-3 py-2 border rounded" value={customerForm.last_name} onChange={e => setCustomerForm({...customerForm, last_name: e.target.value})} /></div>
          </div>
          <div><label className="block text-sm font-medium mb-1">Teléfono</label><input className="w-full px-3 py-2 border rounded" value={customerForm.phone || ''} onChange={e => setCustomerForm({...customerForm, phone: e.target.value})} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-sm font-medium mb-1">Correo</label><input type="email" className="w-full px-3 py-2 border rounded" value={customerForm.email || ''} onChange={e => setCustomerForm({...customerForm, email: e.target.value})} /></div>
            <div><label className="block text-sm font-medium mb-1">Ciudad</label><input className="w-full px-3 py-2 border rounded" value={customerForm.city || ''} onChange={e => setCustomerForm({...customerForm, city: e.target.value})} /></div>
          </div>
          <div><label className="block text-sm font-medium mb-1">Puntos</label><input type="number" className="w-full px-3 py-2 border rounded" value={customerForm.loyalty_points || 0} onChange={e => setCustomerForm({...customerForm, loyalty_points: Number(e.target.value)})} /></div>
          <button onClick={handleSaveCustomer} className="w-full bg-black text-white font-bold py-3 rounded-lg">Guardar Cliente</button>
        </Modal>
      )}

      {isDeleteCustomerModalOpen && customerToDelete && (
        <ConfirmModal
          variant="plain"
          title="Eliminar cliente"
          confirmLabel="Eliminar"
          onCancel={() => setIsDeleteCustomerModalOpen(false)}
          onConfirm={handleConfirmDeleteCustomer}
        >
          <p className="text-sm text-gray-600">¿Eliminar a {customerToDelete.first_name} {customerToDelete.last_name} ({customerToDelete.document_id})?</p>
        </ConfirmModal>
      )}
    </>
  );
}
