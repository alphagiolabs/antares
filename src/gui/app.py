"""Interfaz gráfica con tkinter para el convertidor de imágenes."""

import tkinter as tk
from tkinter import ttk, filedialog, messagebox, scrolledtext
from pathlib import Path
import threading

from core.converter import obtener_formatos, procesar_lote
from core.database import init_db, importar_excel, exportar_excel, generar_plantilla_excel, buscar_por_codigo
from core.renamer import RenamerEngine
from utils.validators import es_imagen


class ConvertidorApp:
    def __init__(self, root):
        self.root = root
        self.root.title("HidroConvert - Conversor y Renombrador de Imágenes")
        self.root.geometry("900", "700")
        self.root.minsize(800, 600)

        # Inicializar base de datos
        init_db()

        # Variables
        self.rutas_imagenes = []
        self.carpeta_destino = tk.StringVar()
        self.formato = tk.StringVar(value="JPEG")
        self.calidad = tk.IntVar(value=95)
        self.resize_ancho = tk.StringVar()
        self.resize_alto = tk.StringVar()
        self.keep_exif = tk.BooleanVar(value=False)
        self.patron_renombrado = tk.StringVar(value="{codigo}_{nombre}{ext}")
        self.secuencia = tk.IntVar(value=1)
        self.usar_renombrado = tk.BooleanVar(value=True)

        self._construir_ui()

    def _construir_ui(self):
        # Notebook (pestañas)
        notebook = ttk.Notebook(self.root)
        notebook.pack(fill=tk.BOTH, expand=True, padx=10, pady=10)

        # Pestaña 1: Conversión
        tab_conv = ttk.Frame(notebook)
        notebook.add(tab_conv, text="Conversión y Renombrado")
        self._construir_tab_conversion(tab_conv)

        # Pestaña 2: Base de Datos
        tab_bd = ttk.Frame(notebook)
        notebook.add(tab_bd, text="Base de Datos (Excel)")
        self._construir_tab_bd(tab_bd)

        # Barra de estado
        self.status_var = tk.StringVar(value="Listo")
        status_bar = ttk.Label(self.root, textvariable=self.status_var, relief=tk.SUNKEN, anchor=tk.W)
        status_bar.pack(side=tk.BOTTOM, fill=tk.X)

    def _construir_tab_conversion(self, parent):
        # Frame superior: selección de archivos
        frame_archivos = ttk.LabelFrame(parent, text="Archivos de Origen", padding=10)
        frame_archivos.pack(fill=tk.X, pady=(0, 10))

        ttk.Button(frame_archivos, text="Agregar Imágenes", command=self._seleccionar_imagenes).pack(side=tk.LEFT, padx=(0, 5))
        ttk.Button(frame_archivos, text="Agregar Carpeta", command=self._seleccionar_carpeta).pack(side=tk.LEFT, padx=(0, 5))
        ttk.Button(frame_archivos, text="Limpiar Lista", command=self._limpiar_lista).pack(side=tk.LEFT)

        self.lista_archivos = tk.Listbox(parent, height=8, selectmode=tk.EXTENDED)
        self.lista_archivos.pack(fill=tk.BOTH, expand=True, pady=(0, 10))

        # Frame medio: opciones
        frame_opts = ttk.LabelFrame(parent, text="Opciones de Conversión", padding=10)
        frame_opts.pack(fill=tk.X, pady=(0, 10))

        ttk.Label(frame_opts, text="Formato:").grid(row=0, column=0, sticky=tk.W)
        combo_formato = ttk.Combobox(frame_opts, textvariable=self.formato, values=obtener_formatos(), state="readonly", width=12)
        combo_formato.grid(row=0, column=1, sticky=tk.W, padx=(0, 20))

        ttk.Label(frame_opts, text="Calidad (1-100):").grid(row=0, column=2, sticky=tk.W)
        ttk.Spinbox(frame_opts, from_=1, to=100, textvariable=self.calidad, width=8).grid(row=0, column=3, sticky=tk.W, padx=(0, 20))

        ttk.Label(frame_opts, text="Redimensionar:").grid(row=1, column=0, sticky=tk.W, pady=(5, 0))
        ttk.Entry(frame_opts, textvariable=self.resize_ancho, width=8).grid(row=1, column=1, sticky=tk.W, pady=(5, 0))
        ttk.Label(frame_opts, text="x").grid(row=1, column=2, sticky=tk.W, pady=(5, 0))
        ttk.Entry(frame_opts, textvariable=self.resize_alto, width=8).grid(row=1, column=3, sticky=tk.W, pady=(5, 0))

        ttk.Checkbutton(frame_opts, text="Preservar metadatos EXIF", variable=self.keep_exif).grid(row=1, column=4, sticky=tk.W, padx=(10, 0), pady=(5, 0))

        # Frame renombrado
        frame_rename = ttk.LabelFrame(parent, text="Renombrado Automático (usar BD)", padding=10)
        frame_rename.pack(fill=tk.X, pady=(0, 10))

        ttk.Checkbutton(frame_rename, text="Activar renombrado automático", variable=self.usar_renombrado).grid(row=0, column=0, sticky=tk.W, columnspan=2)
        ttk.Label(frame_rename, text="Patrón:").grid(row=1, column=0, sticky=tk.W, pady=(5, 0))
        ttk.Entry(frame_rename, textvariable=self.patron_renombrado, width=50).grid(row=1, column=1, sticky=tk.W, pady=(5, 0), padx=(5, 0))
        ttk.Label(frame_rename, text="Variables: {codigo} {nombre} {categoria} {marca} {modelo} {descripcion} {seq} {ext}").grid(row=2, column=0, columnspan=3, sticky=tk.W, pady=(5, 0))
        ttk.Label(frame_rename, text="Secuencia inicial:").grid(row=3, column=0, sticky=tk.W, pady=(5, 0))
        ttk.Spinbox(frame_rename, from_=1, to=9999, textvariable=self.secuencia, width=8).grid(row=3, column=1, sticky=tk.W, padx=(5, 0), pady=(5, 0))

        # Frame destino
        frame_dest = ttk.LabelFrame(parent, text="Carpeta de Destino", padding=10)
        frame_dest.pack(fill=tk.X, pady=(0, 10))

        ttk.Entry(frame_dest, textvariable=self.carpeta_destino, width=70).pack(side=tk.LEFT, fill=tk.X, expand=True, padx=(0, 5))
        ttk.Button(frame_dest, text="Seleccionar...", command=self._seleccionar_destino).pack(side=tk.LEFT)

        # Botones de acción
        frame_acciones = ttk.Frame(parent)
        frame_acciones.pack(fill=tk.X, pady=(0, 10))
        ttk.Button(frame_acciones, text="Vista Previa de Nombres", command=self._vista_previa).pack(side=tk.LEFT, padx=(0, 5))
        ttk.Button(frame_acciones, text="Procesar Lote", command=self._procesar).pack(side=tk.LEFT)

        # Log
        self.log_text = scrolledtext.ScrolledText(parent, height=8, state=tk.DISABLED)
        self.log_text.pack(fill=tk.BOTH, expand=True)

    def _construir_tab_bd(self, parent):
        ttk.Label(parent, text="Importar base de datos desde Excel", font=("Segoe UI", 10, "bold")).pack(anchor=tk.W, pady=(10, 5))

        frame_imp = ttk.Frame(parent)
        frame_imp.pack(fill=tk.X, pady=(0, 10))
        ttk.Button(frame_imp, text="Importar Excel", command=self._importar_excel).pack(side=tk.LEFT, padx=(0, 5))
        ttk.Button(frame_imp, text="Exportar Excel", command=self._exportar_excel).pack(side=tk.LEFT, padx=(0, 5))
        ttk.Button(frame_imp, text="Generar Plantilla", command=self._generar_plantilla).pack(side=tk.LEFT)

        ttk.Label(parent, text="Registros cargados:").pack(anchor=tk.W, pady=(10, 0))
        self.tree_registros = ttk.Treeview(parent, columns=("codigo", "nombre", "categoria", "marca", "modelo"), show="headings", height=15)
        self.tree_registros.heading("codigo", text="Código")
        self.tree_registros.heading("nombre", text="Nombre")
        self.tree_registros.heading("categoria", text="Categoría")
        self.tree_registros.heading("marca", text="Marca")
        self.tree_registros.heading("modelo", text="Modelo")
        self.tree_registros.column("codigo", width=120)
        self.tree_registros.column("nombre", width=200)
        self.tree_registros.column("categoria", width=120)
        self.tree_registros.column("marca", width=120)
        self.tree_registros.column("modelo", width=120)
        self.tree_registros.pack(fill=tk.BOTH, expand=True, pady=(5, 10))

        ttk.Button(parent, text="Refrescar registros", command=self._cargar_registros).pack(anchor=tk.W)

    def _log(self, mensaje):
        self.log_text.configure(state=tk.NORMAL)
        self.log_text.insert(tk.END, mensaje + "\n")
        self.log_text.see(tk.END)
        self.log_text.configure(state=tk.DISABLED)

    def _seleccionar_imagenes(self):
        rutas = filedialog.askopenfilenames(
            title="Seleccionar imágenes",
            filetypes=[("Imágenes", "*.jpg *.jpeg *.png *.webp *.bmp *.tiff *.tif *.gif"), ("Todos", "*.*")]
        )
        for r in rutas:
            if r not in self.rutas_imagenes:
                self.rutas_imagenes.append(r)
                self.lista_archivos.insert(tk.END, Path(r).name)
        self.status_var.set(f"{len(self.rutas_imagenes)} archivos cargados")

    def _seleccionar_carpeta(self):
        carpeta = filedialog.askdirectory(title="Seleccionar carpeta con imágenes")
        if not carpeta:
            return
        agregados = 0
        for ext in ("*.jpg", "*.jpeg", "*.png", "*.webp", "*.bmp", "*.tiff", "*.tif", "*.gif"):
            for r in Path(carpeta).rglob(ext):
                r_str = str(r)
                if r_str not in self.rutas_imagenes:
                    self.rutas_imagenes.append(r_str)
                    self.lista_archivos.insert(tk.END, r.name)
                    agregados += 1
        self.status_var.set(f"{len(self.rutas_imagenes)} archivos cargados (+{agregados})")

    def _limpiar_lista(self):
        self.rutas_imagenes.clear()
        self.lista_archivos.delete(0, tk.END)
        self.status_var.set("Lista limpiada")

    def _seleccionar_destino(self):
        carpeta = filedialog.askdirectory(title="Carpeta de destino")
        if carpeta:
            self.carpeta_destino.set(carpeta)

    def _vista_previa(self):
        if not self.rutas_imagenes:
            messagebox.showwarning("Sin archivos", "No hay imágenes cargadas.")
            return
        engine = RenamerEngine(self.patron_renombrado.get(), self.secuencia.get())
        preview = engine.preview_lote(self.rutas_imagenes)

        ventana = tk.Toplevel(self.root)
        ventana.title("Vista Previa de Renombrado")
        ventana.geometry("700", "400")
        tree = ttk.Treeview(ventana, columns=("origen", "nuevo", "en_bd"), show="headings")
        tree.heading("origen", text="Archivo Original")
        tree.heading("nuevo", text="Nombre Sugerido")
        tree.heading("en_bd", text="En BD")
        tree.column("origen", width=250)
        tree.column("nuevo", width=300)
        tree.column("en_bd", width=60)
        tree.pack(fill=tk.BOTH, expand=True, padx=10, pady=10)

        for origen, nuevo, en_bd in preview:
            tree.insert("", tk.END, values=(Path(origen).name, nuevo, "Sí" if en_bd else "No"))

    def _procesar(self):
        if not self.rutas_imagenes:
            messagebox.showwarning("Sin archivos", "Carga imágenes primero.")
            return
        destino = self.carpeta_destino.get().strip()
        if not destino:
            messagebox.showwarning("Sin destino", "Selecciona una carpeta de destino.")
            return

        formato = self.formato.get()
        calidad = self.calidad.get()
        resize = None
        if self.resize_ancho.get().strip() and self.resize_alto.get().strip():
            try:
                resize = (int(self.resize_ancho.get()), int(self.resize_alto.get()))
            except ValueError:
                messagebox.showerror("Error", "Dimensiones de redimensionado inválidas.")
                return

        # Si renombrado está activo, necesitamos renombrar antes de convertir o después
        usar_rename = self.usar_renombrado.get()
        engine = None
        if usar_rename:
            engine = RenamerEngine(self.patron_renombrado.get(), self.secuencia.get())

        self._log("Iniciando procesamiento...")
        self.status_var.set("Procesando...")

        # Capturar estado actual para el worker thread
        rutas_copia = list(self.rutas_imagenes)
        keep_exif = self.keep_exif.get()

        def worker():
            try:
                resultados = procesar_lote(
                    rutas_copia,
                    destino,
                    formato,
                    calidad,
                    resize,
                    keep_exif,
                    progreso_callback=lambda i, t, r: self.status_var.set(f"Procesando {i}/{t}...")
                )
                # Si se usó renombrado, renombrar los archivos generados
                if usar_rename and engine:
                    for i, ruta_generada in enumerate(resultados):
                        if isinstance(ruta_generada, str) and ruta_generada.startswith("ERROR"):
                            continue
                        ruta_gen = Path(ruta_generada)
                        # Obtener datos BD basado en nombre original
                        origen = Path(rutas_copia[i])
                        codigo = origen.stem
                        datos = buscar_por_codigo(codigo)
                        nuevo_nombre = engine.aplicar(ruta_gen, datos_bd=datos, codigo_manual=codigo)
                        nueva_ruta = ruta_gen.parent / nuevo_nombre
                        ruta_gen.rename(nueva_ruta)
                        resultados[i] = nueva_ruta

                for res in resultados:
                    if isinstance(res, str) and res.startswith("ERROR"):
                        self.root.after(0, lambda r=res: self._log(r))
                    else:
                        self.root.after(0, lambda r=res: self._log(f"OK: {Path(r).name}"))
                self.root.after(0, lambda: self.status_var.set("Procesamiento completado"))
                self.root.after(0, lambda: messagebox.showinfo("Listo", "Procesamiento finalizado."))
            except Exception as e:
                self.root.after(0, lambda: self._log(f"ERROR GENERAL: {e}"))
                self.root.after(0, lambda: self.status_var.set("Error en procesamiento"))

        threading.Thread(target=worker, daemon=True).start()

    def _importar_excel(self):
        ruta = filedialog.askopenfilename(filetypes=[("Excel", "*.xlsx")])
        if not ruta:
            return
        try:
            cantidad = importar_excel(ruta)
            messagebox.showinfo("Importado", f"Se importaron {cantidad} registros.")
            self._cargar_registros()
        except Exception as e:
            messagebox.showerror("Error", f"No se pudo importar:\n{e}")

    def _exportar_excel(self):
        ruta = filedialog.asksaveasfilename(defaultextension=".xlsx", filetypes=[("Excel", "*.xlsx")])
        if not ruta:
            return
        try:
            cantidad = exportar_excel(ruta)
            messagebox.showinfo("Exportado", f"Se exportaron {cantidad} registros.")
        except Exception as e:
            messagebox.showerror("Error", f"No se pudo exportar:\n{e}")

    def _generar_plantilla(self):
        ruta = filedialog.asksaveasfilename(defaultextension=".xlsx", filetypes=[("Excel", "*.xlsx")])
        if not ruta:
            return
        try:
            generar_plantilla_excel(ruta)
            messagebox.showinfo("Plantilla", f"Plantilla guardada en:\n{ruta}")
        except Exception as e:
            messagebox.showerror("Error", f"No se pudo generar la plantilla:\n{e}")

    def _cargar_registros(self):
        from core.database import obtener_todos
        registros = obtener_todos()
        for item in self.tree_registros.get_children():
            self.tree_registros.delete(item)
        for r in registros:
            self.tree_registros.insert("", tk.END, values=(
                r.get("codigo", ""), r.get("nombre", ""), r.get("categoria", ""),
                r.get("marca", ""), r.get("modelo", "")
            ))
        self.status_var.set(f"{len(registros)} registros en base de datos")


def main():
    root = tk.Tk()
    app = ConvertidorApp(root)
    root.mainloop()


if __name__ == "__main__":
    main()
