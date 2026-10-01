import { useEffect, useState } from 'react';
import { api } from '../../lib/apiClient';
import { emptyToNull } from '../../lib/utils';
import { AlertTriangle, Edit, HelpCircle, Plus, Trash2 } from 'lucide-react';
import Modal from '../ui/Modal';
import ConfirmModal from '../ui/ConfirmModal';
import { Table, TableHeader, TableHeaderCell, TableBody, TableCell } from '../ui/Table';

interface InventoryTabProps {
  showToast: (msg: string) => void;
}

const emptyProductForm = { name: '', category: 'General', subcategory: '', sku: '', barcode: '', flavor: '', cost_price: 0, sale_price: 0, stock_quantity: 0, wholesale_price: 0, min_wholesale_qty: 0 };

// Inventario y Categorías: CRUD de productos (con gasto automático de mercancía)
// y gestión de categorías/subcategorías.
export default function InventoryTab({ showToast }: InventoryTabProps) {
  const [products, setProducts] = useState<any[]>([]);
  const [productCategories, setProductCategories] = useState<any[]>([]);
  const [inventoryFilterCategory, setInventoryFilterCategory] = useState<string>('ALL');
  const [inventorySort, setInventorySort] = useState<string>('LATEST');

  useEffect(() => {
    fetchProducts();
  }, []);

  const fetchProducts = async () => {
    const { data } = await api.from('products').select('*').eq('is_active', true).order('created_at', { ascending: false });
    if (data) setProducts(data);
    const { data: catData } = await api.from('product_categories').select('*').order('name');
    if (catData) setProductCategories(catData);
  };

  // Modal Producto
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [productForm, setProductForm] = useState<any>({ ...emptyProductForm });

  // Modal Categoría
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<any>(null);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategoryDescription, setNewCategoryDescription] = useState("");
  const [subcategoriesList, setSubcategoriesList] = useState<string[]>([]);

  // Modal Eliminar Categoría
  const [isDeleteCategoryModalOpen, setIsDeleteCategoryModalOpen] = useState(false);
  const [categoryToDelete, setCategoryToDelete] = useState<any>(null);
  const [reassignCategoryName, setReassignCategoryName] = useState('General');

  // Modal Eliminar Producto
  const [productToDelete, setProductToDelete] = useState<any>(null);
  const [isDeleteProductModalOpen, setIsDeleteProductModalOpen] = useState(false);

  const emptyProductPayload = () => ({ ...emptyProductForm });

  const validateProductForm = () => {
    if (!String(productForm.name || '').trim()) {
      showToast("El nombre del producto es obligatorio.");
      return false;
    }
    if (!String(productForm.category || '').trim()) {
      showToast("La categoría es obligatoria.");
      return false;
    }
    if (Number(productForm.cost_price) < 0 || Number(productForm.sale_price) < 0) {
      showToast("Los precios no pueden ser negativos.");
      return false;
    }
    if (Number(productForm.stock_quantity) < 0) {
      showToast("El stock no puede ser negativo.");
      return false;
    }
    if (Number(productForm.wholesale_price) < 0 || Number(productForm.min_wholesale_qty) < 0) {
      showToast("Precio al mayor y cantidad mínima no pueden ser negativos.");
      return false;
    }
    if (Number(productForm.wholesale_price) > 0 && Number(productForm.min_wholesale_qty) < 1) {
      showToast("Si hay precio al mayor, la cantidad mínima debe ser al menos 1.");
      return false;
    }
    if (Number(productForm.sale_price) < Number(productForm.cost_price)) {
      showToast("Aviso: el precio de venta es menor que el costo. Se guardará igual.");
    }
    return true;
  };

  const handleSaveProduct = async () => {
    if (!validateProductForm()) return;

    const payload: any = {
      name: String(productForm.name).trim(),
      category: productForm.category,
      subcategory: emptyToNull(productForm.subcategory),
      flavor: emptyToNull(productForm.flavor),
      sku: emptyToNull(productForm.sku),
      barcode: emptyToNull(productForm.barcode),
      cost_price: Number(productForm.cost_price) || 0,
      sale_price: Number(productForm.sale_price) || 0,
      wholesale_price: Number(productForm.wholesale_price) || 0,
      min_wholesale_qty: Number(productForm.min_wholesale_qty) || 0,
      stock_quantity: Number(productForm.stock_quantity) || 0,
    };

    if (productForm.id) {
       const previous = products.find((p: any) => p.id === productForm.id);
       const { error } = await api.from('products').update(payload).eq('id', productForm.id);
       if (error) {
         showToast("Error actualizando: " + error.message);
         return;
       }
       const addedStock = Number(payload.stock_quantity) - Number(previous?.stock_quantity || 0);
       if (addedStock > 0) {
         await api.from('expenses').insert([{
           description: `Reposición: ${payload.name}${payload.flavor ? ` (${payload.flavor})` : ''}`,
           amount_usd: payload.cost_price * addedStock,
           category: 'inventory_purchase'
         }]);
       }
       showToast("Producto actualizado. Las ventas anteriores conservan su precio y costo.");
    } else {
       const { error } = await api.from('products').insert([payload]);
       if (error) {
         showToast("Error creando: " + error.message);
         return;
       }
       if (payload.stock_quantity > 0) {
         await api.from('expenses').insert([{
           description: `Ingreso de mercancía: ${payload.name}${payload.flavor ? ` (${payload.flavor})` : ''}`,
           amount_usd: payload.cost_price * payload.stock_quantity,
           category: 'inventory_purchase'
         }]);
       }
       showToast("Producto y gasto de mercancía registrados.");
    }
    setIsProductModalOpen(false);
    setProductForm(emptyProductPayload());
    fetchProducts();
  };

  const openCategoryModal = (cat: any | null = null) => {
    if (cat) {
      setEditingCategory(cat);
      setNewCategoryName(cat.name || '');
      setNewCategoryDescription(cat.description || '');
      const kids = productCategories.filter((c: any) => c.parent_category === cat.name).map((c: any) => c.name);
      setSubcategoriesList(kids.length ? kids : []);
    } else {
      setEditingCategory(null);
      setNewCategoryName('');
      setNewCategoryDescription('');
      setSubcategoriesList([]);
    }
    setIsCategoryModalOpen(true);
  };

  const handleSaveCategory = async () => {
      const catTitle = newCategoryName.trim();
      if(!catTitle) {
        showToast("Debes ingresar el título de la categoría.");
        return;
      }

      if (editingCategory) {
        const oldName = editingCategory.name;
        if (catTitle !== oldName) {
          const { data: clash } = await api.from('product_categories').select('id').eq('name', catTitle).maybeSingle();
          if (clash && clash.id !== editingCategory.id) {
            showToast("Ya existe otra categoría con ese nombre.");
            return;
          }
          await api.from('products').update({ category: catTitle }).eq('category', oldName);
          await api.from('products').update({ subcategory: catTitle }).eq('subcategory', oldName);
          await api.from('product_categories').update({ parent_category: catTitle }).eq('parent_category', oldName);
        }
        const { error: catErr } = await api.from('product_categories').update({
          name: catTitle,
          description: newCategoryDescription.trim() || null,
        }).eq('id', editingCategory.id);
        if (catErr) {
          showToast("Error actualizando categoría: " + catErr.message);
          return;
        }

        const existingSubs = productCategories.filter((c: any) => c.parent_category === oldName);
        const validSubcategories = subcategoriesList.map(s => s.trim()).filter(s => s.length > 0);
        for (const sub of existingSubs) {
          if (!validSubcategories.includes(sub.name)) {
            await api.from('products').update({ subcategory: null }).eq('subcategory', sub.name);
            await api.from('product_categories').delete().eq('id', sub.id);
          }
        }
        for (const subTitle of validSubcategories) {
          const already = existingSubs.find((s: any) => s.name === subTitle);
          if (!already) {
            await api.from('product_categories').insert([{
              name: subTitle,
              description: newCategoryDescription.trim() || null,
              parent_category: catTitle
            }]);
          }
        }
        showToast("Categoría actualizada. Los productos se reasignaron al nuevo nombre.");
        setIsCategoryModalOpen(false);
        setEditingCategory(null);
        fetchProducts();
        return;
      }

      const { data: existingCat } = await api.from('product_categories').select('*').eq('name', catTitle).maybeSingle();

      if (!existingCat) {
         const { error: catErr } = await api.from('product_categories').insert([{
             name: catTitle,
             description: newCategoryDescription.trim() || null,
             parent_category: null
         }]);
         if (catErr) {
            showToast("Error creando categoría: " + catErr.message);
            return;
         }
      }

      const validSubcategories = subcategoriesList.map(s => s.trim()).filter(s => s.length > 0);
      let firstCreatedSubcat = "";

      for (const subTitle of validSubcategories) {
         const { error: subErr } = await api.from('product_categories').insert([{
             name: subTitle,
             description: newCategoryDescription.trim() || null,
             parent_category: catTitle
         }]);
         if (subErr) {
            console.error("Error creando subcategoría:", subErr.message);
         } else if (!firstCreatedSubcat) {
            firstCreatedSubcat = subTitle;
         }
      }

      showToast("Categoría y subcategorías guardadas exitosamente.");
      setIsCategoryModalOpen(false);

      setProductForm(prev => ({
        ...prev,
        category: catTitle,
        subcategory: firstCreatedSubcat || prev.subcategory
      }));

      setNewCategoryName("");
      setNewCategoryDescription("");
      setSubcategoriesList([]);

      fetchProducts();
  };

  const handleConfirmDeleteCategory = async () => {
    if (!categoryToDelete) return;
    const oldName = categoryToDelete.name;
    const target = reassignCategoryName || 'General';
    await api.from('products').update({ category: target }).eq('category', oldName);
    await api.from('products').update({ subcategory: null }).eq('subcategory', oldName);
    const children = productCategories.filter((c: any) => c.parent_category === oldName);
    for (const child of children) {
      await api.from('products').update({ subcategory: null }).eq('subcategory', child.name);
      await api.from('product_categories').delete().eq('id', child.id);
    }
    const { error } = await api.from('product_categories').delete().eq('id', categoryToDelete.id);
    if (error) {
      showToast("Error al eliminar categoría: " + error.message);
      return;
    }
    showToast(`Categoría eliminada. Productos reasignados a "${target}".`);
    setIsDeleteCategoryModalOpen(false);
    setCategoryToDelete(null);
    fetchProducts();
  };

  const handleDeleteProduct = (product: any) => {
    setProductToDelete(product);
    setIsDeleteProductModalOpen(true);
  };

  const handleConfirmDeleteProduct = async () => {
    if (!productToDelete) return;
    try {
      // Soft delete para preservar historial de ventas
      const { data, error } = await api.from('products').update({ is_active: false }).eq('id', productToDelete.id).select();

      if (error) {
         showToast("Error al eliminar producto: " + error.message);
      } else if (!data || data.length === 0) {
         showToast("Producto no encontrado o error de permisos de administrador.");
      } else {
         showToast("Producto eliminado (desactivado) del inventario exitosamente.");
         fetchProducts();
         setIsDeleteProductModalOpen(false);
         setProductToDelete(null);
      }
    } catch (err: any) {
      console.error(err);
      showToast("Error al eliminar producto: " + err.message);
    }
  };

  let filteredProducts = inventoryFilterCategory === 'ALL'
      ? [...products]
      : products.filter(p => p.category === inventoryFilterCategory || p.subcategory === inventoryFilterCategory);

  if (inventorySort === 'NAME') {
      filteredProducts.sort((a, b) => a.name.localeCompare(b.name));
  } else if (inventorySort === 'STOCK_LOW') {
      filteredProducts.sort((a, b) => a.stock_quantity - b.stock_quantity);
  }
  // LATEST is handled by the default fetch order, but we can rely on order array

  return (
    <>
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
        <h2 className="text-2xl font-bold text-gray-900">Inventario y Categorías</h2>
        <div className="flex flex-wrap gap-2">
            <select
                className="px-4 py-2 border border-gray-300 rounded-lg outline-none focus:border-black text-sm"
                value={inventoryFilterCategory}
                onChange={(e) => setInventoryFilterCategory(e.target.value)}
            >
                <option value="ALL">Todas las Categorías</option>
                {productCategories.map(c => (
                    <option key={c.id} value={c.name}>{c.name} {c.parent_category ? `(Sub de ${c.parent_category})` : ''}</option>
                ))}
            </select>
            <select
                className="px-4 py-2 border border-gray-300 rounded-lg outline-none focus:border-black text-sm"
                value={inventorySort}
                onChange={(e) => setInventorySort(e.target.value)}
            >
                <option value="LATEST">Últimos Agregados</option>
                <option value="NAME">Por Nombre</option>
                <option value="STOCK_LOW">Menor Stock</option>
            </select>
            <button
              onClick={() => openCategoryModal(null)}
              className="bg-gray-100 hover:bg-gray-200 text-gray-800 px-4 py-2 rounded-lg font-medium flex items-center gap-2 text-sm border border-gray-300">
              <Plus className="w-4 h-4"/> Categoría
            </button>
            <button
              onClick={() => { setProductForm(emptyProductPayload()); setIsProductModalOpen(true); }}
              className="bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-lg font-medium flex items-center gap-2 text-sm">
              <Plus className="w-4 h-4"/> Mercancía
            </button>
        </div>
      </div>
      {productCategories.filter((c: any) => !c.parent_category).length > 0 && (
        <div className="flex flex-wrap gap-2 mb-4">
          {productCategories.filter((c: any) => !c.parent_category).map((c: any) => (
            <div key={c.id} className="flex items-center gap-1 bg-white border border-gray-200 rounded-lg px-3 py-1.5 text-sm">
              <span className="font-medium text-gray-800">{c.name}</span>
              <button onClick={() => openCategoryModal(c)} className="text-blue-500 hover:text-blue-700 p-0.5" title="Editar categoría"><Edit className="w-3.5 h-3.5"/></button>
              <button onClick={() => { setCategoryToDelete(c); setReassignCategoryName('General'); setIsDeleteCategoryModalOpen(true); }} className="text-red-500 hover:text-red-700 p-0.5" title="Eliminar categoría"><Trash2 className="w-3.5 h-3.5"/></button>
            </div>
          ))}
        </div>
      )}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden mb-6">
        <Table>
          <TableHeader>
            <tr>
              <TableHeaderCell>Producto</TableHeaderCell>
              <TableHeaderCell>Categoría</TableHeaderCell>
              <TableHeaderCell>Sabor / Tipo</TableHeaderCell>
              <TableHeaderCell className="text-center">Stock</TableHeaderCell>
              <TableHeaderCell className="text-right">Costo Base</TableHeaderCell>
              <TableHeaderCell className="text-right">Precio Venta</TableHeaderCell>
              <TableHeaderCell className="text-right">Mayor</TableHeaderCell>
              <TableHeaderCell className="text-center">Acciones</TableHeaderCell>
            </tr>
          </TableHeader>
          <TableBody>
            {filteredProducts.length === 0 ? (
              <tr><td colSpan={8} className="p-8 text-center text-gray-500">No hay productos registrados en esta categoría.</td></tr>
            ) : (
              filteredProducts.map(p => (
                <tr key={p.id}>
                  <TableCell className="font-medium">{p.name}<div className="text-xs text-gray-400 font-mono">{p.sku || p.barcode || ''}</div></TableCell>
                  <TableCell className="text-sm text-gray-600">
                    {p.category} {p.subcategory && <span className="text-gray-400">/ {p.subcategory}</span>}
                  </TableCell>
                  <TableCell className="text-sm text-orange-700">{p.flavor || '—'}</TableCell>
                  <TableCell className="text-center">
                    <span className={`px-2 py-1 rounded text-xs font-bold ${p.stock_quantity > 10 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                      {p.stock_quantity}
                    </span>
                  </TableCell>
                  <TableCell className="text-right text-gray-500">${p.cost_price}</TableCell>
                  <TableCell className="text-right font-bold">${p.sale_price}</TableCell>
                  <TableCell className="text-right text-sm text-gray-600">{Number(p.wholesale_price) > 0 ? `$${p.wholesale_price} / ${p.min_wholesale_qty || 1}u` : '—'}</TableCell>
                  <TableCell className="text-center">
                    <button onClick={() => { setProductForm({ ...emptyProductForm, ...p, flavor: p.flavor || '', barcode: p.barcode || '', wholesale_price: p.wholesale_price || 0, min_wholesale_qty: p.min_wholesale_qty || 0 }); setIsProductModalOpen(true); }} className="text-blue-500 hover:text-blue-700 mx-2" title="Editar"><Edit className="w-4 h-4"/></button>
                    <button onClick={() => handleDeleteProduct(p)} className="text-red-500 hover:text-red-700 mx-2" title="Eliminar"><Trash2 className="w-4 h-4"/></button>
                  </TableCell>
                </tr>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Modal Producto */}
      {isProductModalOpen && (
        <Modal title={productForm.id ? 'Editar Producto' : 'Ingresar Mercancía'} onClose={() => setIsProductModalOpen(false)} bodyClassName="p-4 space-y-4 max-h-[80vh] overflow-y-auto">
          <div><label className="block text-sm font-medium mb-1">Nombre</label><input type="text" className="w-full px-3 py-2 border rounded" value={productForm.name} onChange={e => setProductForm({...productForm, name: e.target.value})} /></div>
          <div><label className="block text-sm font-medium mb-1">Sabor / Tipo / Variante</label><input type="text" className="w-full px-3 py-2 border rounded" placeholder="Ej. Fresa, Chocolate, 5 lbs" value={productForm.flavor || ''} onChange={e => setProductForm({...productForm, flavor: e.target.value})} /></div>
          <div className="grid grid-cols-2 gap-4">
              <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="block text-sm font-medium">Categoría</label>
                    <button
                      type="button"
                      onClick={() => openCategoryModal(null)}
                      className="text-xs text-orange-600 hover:text-orange-700 font-bold flex items-center gap-0.5"
                    >
                      <Plus className="w-3 h-3" /> Crear
                    </button>
                  </div>
                  <select className="w-full px-3 py-2 border rounded" value={productForm.category} onChange={e => {
                      if (e.target.value === '__NEW_CAT__') {
                        openCategoryModal(null);
                      } else {
                        setProductForm({...productForm, category: e.target.value, subcategory: ''});
                      }
                  }}>
                      <option value="General">General</option>
                      {productCategories.filter(c => !c.parent_category).map(c => (
                          <option key={c.id} value={c.name}>{c.name}</option>
                      ))}
                      <option value="__NEW_CAT__" className="font-bold text-orange-600">+ Crear nueva categoría...</option>
                  </select>
              </div>
              <div>
                  <label className="block text-sm font-medium mb-1">Subcategoría</label>
                  <select className="w-full px-3 py-2 border rounded" value={productForm.subcategory || ''} onChange={e => setProductForm({...productForm, subcategory: e.target.value})}>
                      <option value="">Ninguna</option>
                      {productCategories.filter(c => c.parent_category === productForm.category).map(c => (
                          <option key={c.id} value={c.name}>{c.name}</option>
                      ))}
                  </select>
              </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="block text-sm font-medium mb-1">SKU</label><input type="text" className="w-full px-3 py-2 border rounded" value={productForm.sku || ''} onChange={e => setProductForm({...productForm, sku: e.target.value})} /></div>
            <div><label className="block text-sm font-medium mb-1">Código de barras</label><input type="text" className="w-full px-3 py-2 border rounded font-mono" value={productForm.barcode || ''} onChange={e => setProductForm({...productForm, barcode: e.target.value})} /></div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="block text-sm font-medium mb-1">Stock</label><input type="number" className="w-full px-3 py-2 border rounded" value={productForm.stock_quantity} onChange={e => setProductForm({...productForm, stock_quantity: Number(e.target.value)})} /></div>
            <div><label className="block text-sm font-medium mb-1">Costo Base (USD)</label><input type="number" className="w-full px-3 py-2 border rounded" value={productForm.cost_price} onChange={e => setProductForm({...productForm, cost_price: Number(e.target.value)})} /></div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="block text-sm font-medium mb-1">Precio Venta (USD)</label><input type="number" className="w-full px-3 py-2 border rounded" value={productForm.sale_price} onChange={e => setProductForm({...productForm, sale_price: Number(e.target.value)})} /></div>
            <div><label className="block text-sm font-medium mb-1">Precio al mayor (USD)</label><input type="number" className="w-full px-3 py-2 border rounded" value={productForm.wholesale_price || 0} onChange={e => setProductForm({...productForm, wholesale_price: Number(e.target.value)})} /></div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Cantidad mínima al mayor</label>
            <input type="number" className="w-full px-3 py-2 border rounded" value={productForm.min_wholesale_qty || 0} onChange={e => setProductForm({...productForm, min_wholesale_qty: Number(e.target.value)})} />
          </div>
          <p className="text-xs text-gray-500">Cambiar costo o precio no modifica ventas ni ganancias ya registradas.</p>
          <button onClick={handleSaveProduct} className="w-full bg-black text-white font-bold py-3 pt-3 rounded-lg mt-4">Guardar Producto</button>
        </Modal>
      )}

      {isCategoryModalOpen && (
        <Modal title={editingCategory ? 'Editar Categoría' : 'Nueva Categoría de Productos'} onClose={() => setIsCategoryModalOpen(false)}>
          <div>
              <label className="block text-sm font-medium mb-1">Título de la Categoría</label>
              <input type="text" placeholder="Ej. Ropa, Suplementos, Accesorios" className="w-full px-3 py-2 border rounded" value={newCategoryName} onChange={e => setNewCategoryName(e.target.value)} />
          </div>
          <div>
              <label className="block text-sm font-medium mb-1">Descripción (Opcional)</label>
              <textarea rows={2} placeholder="Descripción opcional de la categoría..." className="w-full px-3 py-2 border rounded text-sm" value={newCategoryDescription} onChange={e => setNewCategoryDescription(e.target.value)} />
          </div>

          {!subcategoriesList || subcategoriesList.length === 0 ? (
            <button
              type="button"
              onClick={() => setSubcategoriesList([''])}
              className="w-full py-2.5 px-3 border border-dashed border-orange-300 rounded-lg text-orange-600 hover:bg-orange-50 text-sm font-bold flex items-center justify-center gap-1.5 transition-colors"
            >
              <Plus className="w-4 h-4" /> Subcategoría
            </button>
          ) : (
            <div className="bg-orange-50/80 p-3.5 rounded-lg border border-orange-200 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <label className="block text-sm font-bold text-orange-950">Subcategorías</label>
                  <div className="relative group">
                    <HelpCircle className="w-4 h-4 text-orange-600 cursor-pointer" />
                    <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 w-72 p-3 bg-gray-900 text-white text-xs rounded-lg shadow-xl hidden group-hover:block z-50 pointer-events-none leading-relaxed">
                      Esta área está destinada para generar subcategorías de productos. Por ejemplo, si lo que desea es anexar una categoría "ropa" al sistema puede cargar una subcategoría "ropa de dama". Estas subcategorías quedan ligadas a sus categorías generadas que a su vez están ancladas a los productos que se afilien a esas categorías.
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSubcategoriesList([])}
                  className="text-xs text-red-500 hover:underline font-medium"
                >
                  Eliminar todas
                </button>
              </div>

              <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                {subcategoriesList.map((sub, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <input
                      type="text"
                      placeholder={`Ej. Subcategoría ${idx + 1} (ej. Ropa de Dama)`}
                      className="flex-1 px-3 py-1.5 border border-gray-300 rounded bg-white text-sm focus:border-orange-500 outline-none"
                      value={sub}
                      onChange={e => {
                        const val = e.target.value;
                        setSubcategoriesList(prev => {
                          const next = [...prev];
                          next[idx] = val;
                          return next;
                        });
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => setSubcategoriesList(prev => prev.filter((_, i) => i !== idx))}
                      className="text-gray-400 hover:text-red-500 p-1 rounded transition-colors"
                      title="Eliminar esta subcategoría"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>

              <button
                type="button"
                onClick={() => setSubcategoriesList(prev => [...prev, ''])}
                className="text-xs text-orange-600 hover:text-orange-700 font-bold flex items-center gap-1 pt-1"
              >
                <Plus className="w-3.5 h-3.5" /> Agregar otra subcategoría
              </button>
            </div>
          )}

          <button onClick={handleSaveCategory} className="w-full bg-orange-500 hover:bg-orange-600 text-white font-bold py-3 rounded-lg mt-2 transition-colors">{editingCategory ? 'Guardar Cambios' : 'Guardar Categoría'}</button>
        </Modal>
      )}

      {isDeleteCategoryModalOpen && categoryToDelete && (
        <ConfirmModal
          variant="plain"
          title={`Eliminar categoría "${categoryToDelete.name}"`}
          confirmLabel="Eliminar"
          onCancel={() => setIsDeleteCategoryModalOpen(false)}
          onConfirm={handleConfirmDeleteCategory}
        >
          <p className="text-sm text-gray-600">Los productos de esta categoría se reasignarán a:</p>
          <select className="w-full px-3 py-2 border rounded" value={reassignCategoryName} onChange={e => setReassignCategoryName(e.target.value)}>
            <option value="General">General</option>
            {productCategories.filter((c: any) => !c.parent_category && c.id !== categoryToDelete.id).map((c: any) => (
              <option key={c.id} value={c.name}>{c.name}</option>
            ))}
          </select>
        </ConfirmModal>
      )}

      {isDeleteProductModalOpen && productToDelete && (
        <ConfirmModal
          title="Eliminar Producto del Inventario"
          confirmLabel="Sí, Confirmar Eliminación"
          onCancel={() => { setIsDeleteProductModalOpen(false); setProductToDelete(null); }}
          onConfirm={handleConfirmDeleteProduct}
        >
          <p className="text-sm text-gray-600">
            ¿Estás seguro de eliminar el producto <span className="font-bold text-gray-900">"{productToDelete.name}"</span>?
          </p>

          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-900 text-xs leading-relaxed">
            <div className="font-extrabold text-sm mb-1 text-red-700 flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4"/> SE HARÁ UN BORRADO SUAVE
            </div>
            El producto no se borrará por completo de la base de datos para no alterar las estadísticas históricas y reportes de ventas, sino que se marcará como <span className="font-bold">Inactivo</span> para que no vuelva a aparecer en el inventario ni en el POS de los vendedores.
          </div>
        </ConfirmModal>
      )}
    </>
  );
}
