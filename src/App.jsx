import { useEffect, useMemo, useState } from 'react'
import {
  Home,
  Users,
  CarFront,
  Plus,
  Search,
  Wrench,
  History,
  Printer,
  Pencil,
  QrCode,
  UserPlus,
  Save,
  ArrowLeft,
  Trash2,
  ChevronRight,
  UserRound,
  Gauge,
  CalendarDays,
  CircleDollarSign,
  Package,
  X,
  FileText,
} from 'lucide-react'
import { supabase } from './supabaseClient'
import { QRCodeCanvas } from 'qrcode.react'
import './App.css'

function fechaLocal(valor = new Date()) {
  const d = new Date(valor)
  const offset = d.getTimezoneOffset()
  return new Date(d.getTime() - offset * 60000)
    .toISOString()
    .slice(0, 10)
}

function formatoFecha(valor) {
  if (!valor) return '-'

  const fecha = new Date(`${valor}T00:00:00`)

  return fecha.toLocaleDateString('es-AR')
}

function formatoImporte(valor) {
  const numero = Number(valor || 0)

  return numero.toLocaleString('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  })
}

function textoSeguro(valor) {
  return valor ?? ''
}

const MANTENIMIENTO_MARKER = '__ELCHINO_MANTENIMIENTO__'

function obtenerMantenimiento(vehiculo) {
  const observaciones = String(vehiculo?.observaciones || '')
  const indice = observaciones.lastIndexOf(MANTENIMIENTO_MARKER)
  if (indice === -1) return null
  const json = observaciones.slice(indice + MANTENIMIENTO_MARKER.length).trim()
  try { return JSON.parse(json) } catch { return null }
}

function observacionesSinMantenimiento(valor) {
  const observaciones = String(valor || '')
  const indice = observaciones.lastIndexOf(MANTENIMIENTO_MARKER)
  return indice === -1 ? observaciones.trim() : observaciones.slice(0, indice).trim()
}

function construirObservacionesConMantenimiento(observaciones, mantenimiento) {
  const base = observacionesSinMantenimiento(observaciones)
  const bloque = mantenimiento ? `${MANTENIMIENTO_MARKER}${JSON.stringify(mantenimiento)}` : ''
  return [base, bloque].filter(Boolean).join('\n') || null
}

function estadoMantenimiento(mantenimiento, kilometrajeActual) {
  if (!mantenimiento) return null
  const kmActual = Number(kilometrajeActual || 0)
  const kmProximo = Number(mantenimiento.kmProximo || 0)
  const fechaProxima = mantenimiento.fechaProxima || ''
  const vencidoKm = kmProximo > 0 && kmActual > 0 && kmActual >= kmProximo
  const vencidoFecha = Boolean(fechaProxima && fechaLocal() >= fechaProxima)
  if (vencidoKm || vencidoFecha) return 'vencido'
  if (kmProximo > 0 || fechaProxima) return 'pendiente'
  return 'registrado'
}

function textoEstadoMantenimiento(mantenimiento, kilometrajeActual) {
  const estado = estadoMantenimiento(mantenimiento, kilometrajeActual)
  if (!estado) return ''
  if (estado === 'vencido') return 'Mantenimiento pendiente'
  if (estado === 'registrado') return 'Último mantenimiento registrado'
  const partes = []
  const kmActual = Number(kilometrajeActual || 0)
  const kmProximo = Number(mantenimiento.kmProximo || 0)
  if (kmProximo > 0 && kmActual > 0) {
    const faltan = kmProximo - kmActual
    partes.push(faltan <= 0 ? 'por kilometraje' : `faltan ${faltan.toLocaleString('es-AR')} km`)
  }
  if (mantenimiento.fechaProxima) partes.push(`fecha ${formatoFecha(mantenimiento.fechaProxima)}`)
  return partes.join(' · ') || 'Próximo service cargado'
}

function totalRepuestos(partes = []) {
  return partes.reduce((total, parte) => {
    const cantidad = Number(parte.cantidad || 1)
    const precio = Number(parte.precio || 0)
    return total + cantidad * precio
  }, 0)
}

function esPresupuesto(trabajo) {
  return String(trabajo?.tipo_trabajo || '').startsWith('__PRESUPUESTO__|')
}

function tipoPresupuesto(trabajo) {
  const valor = String(trabajo?.tipo_trabajo || '')
  return valor.startsWith('__PRESUPUESTO__|')
    ? valor.replace('__PRESUPUESTO__|', '') || 'General'
    : valor || 'General'
}

function App() {
  const params = new URLSearchParams(window.location.search)
  const modoPublico = params.has('vehiculo')

  const [pantalla, setPantalla] = useState(
    modoPublico ? 'publico' : 'inicio'
  )

  const [vehiculos, setVehiculos] = useState([])
  const [clientes, setClientes] = useState([])
  const [trabajos, setTrabajos] = useState([])
  const [trabajoPartes, setTrabajoPartes] = useState([])
  const [trabajoFotos, setTrabajoFotos] = useState([])
  const [fotosTrabajoForm, setFotosTrabajoForm] = useState([])

  const [vehiculoSeleccionado, setVehiculoSeleccionado] =
    useState(null)

  const [clienteSeleccionado, setClienteSeleccionado] =
    useState(null)

  const [trabajoSeleccionado, setTrabajoSeleccionado] =
    useState(null)

  const [vehiculoPublico, setVehiculoPublico] =
    useState(null)

  const [trabajosPublicos, setTrabajosPublicos] =
    useState([])

  const [partesPublicos, setPartesPublicos] =
    useState([])

  const [fotosPublicas, setFotosPublicas] =
    useState([])

  const [busquedaVehiculo, setBusquedaVehiculo] =
    useState('')

  const [busquedaCliente, setBusquedaCliente] =
    useState('')

  const [cargando, setCargando] = useState(false)
  const [guardando, setGuardando] = useState(false)

  const [mensaje, setMensaje] = useState('')
  const [error, setError] = useState('')

  const [mostrarQR, setMostrarQR] = useState(false)
  const [fotoVehiculo, setFotoVehiculo] = useState(null)
  const [fotoAmpliada, setFotoAmpliada] = useState(null)
  const [mostrarMantenimiento, setMostrarMantenimiento] = useState(false)
  const [formMantenimiento, setFormMantenimiento] = useState({ tipo:'Cambio de aceite y filtros', fechaUltimo:'', kmUltimo:'', kmProximo:'', fechaProxima:'', notas:'' })

  const [formVehiculo, setFormVehiculo] = useState({
    patente: '',
    marca: '',
    modelo: '',
    anio: '',
    vin: '',
    kilometraje: '',
    cliente_id: '',
    observaciones: '',
    foto_url: '',
  })

  const [formCliente, setFormCliente] = useState({
    nombre: '',
    telefono: '',
    email: '',
    direccion: '',
    observaciones: '',

    vehiculo_patente: '',
    vehiculo_marca: '',
    vehiculo_modelo: '',
    vehiculo_anio: '',
    vehiculo_vin: '',
    vehiculo_kilometraje: '',
    vehiculo_observaciones: '',
  })

  const [formTrabajo, setFormTrabajo] = useState({
    fecha: fechaLocal(),
    kilometraje: '',
    tipo_trabajo: '',
    descripcion: '',
    observaciones: '',
    importe: '',
    programarMantenimiento: false,
    proximoKm: '',
    proximaFecha: '',
  })

  const [partesForm, setPartesForm] = useState([])

  const [presupuestoSeleccionado, setPresupuestoSeleccionado] = useState(null)

  useEffect(() => {
    cargarDatos()
  }, [])

  useEffect(() => {
    if (modoPublico) {
      cargarHistorialPublico()
    }
  }, [])

  async function cargarDatos() {
    setCargando(true)
    setError('')

    const [
      resultadoVehiculos,
      resultadoClientes,
      resultadoTrabajos,
    ] = await Promise.all([
      supabase
        .from('vehicles')
        .select('*, customers(*)')
        .order('created_at', { ascending: false }),

      supabase
        .from('customers')
        .select('*')
        .order('created_at', { ascending: false }),

      supabase
        .from('service_records')
        .select('*')
        .order('fecha', { ascending: false }),
    ])

    if (resultadoVehiculos.error) {
      console.error(resultadoVehiculos.error)
      setError(
        `No se pudieron cargar los vehículos: ${resultadoVehiculos.error.message}`
      )
    }

    if (resultadoClientes.error) {
      console.error(resultadoClientes.error)
      setError(
        `No se pudieron cargar los clientes: ${resultadoClientes.error.message}`
      )
    }

    if (resultadoTrabajos.error) {
      console.error(resultadoTrabajos.error)
      setError(
        `No se pudieron cargar los trabajos: ${resultadoTrabajos.error.message}`
      )
    }

    setVehiculos(resultadoVehiculos.data || [])
    setClientes(resultadoClientes.data || [])
    setTrabajos(resultadoTrabajos.data || [])

    setCargando(false)
  }

  async function cargarHistorialPublico() {
    const id = params.get('vehiculo')

    if (!id) return

    setCargando(true)
    setError('')

    const { data: vehiculo, error: errorVehiculo } =
      await supabase
        .from('vehicles')
        .select('id, patente, marca, modelo, anio, vin, kilometraje, observaciones')
        .eq('id', id)
        .single()

    if (errorVehiculo) {
      console.error(errorVehiculo)

      setError(
        'No se pudo encontrar el vehículo.'
      )

      setCargando(false)
      return
    }

    const { data: servicios, error: errorServicios } =
      await supabase
        .from('service_records')
        .select('*')
        .eq('vehicle_id', id)
        .order('fecha', { ascending: false })

    if (errorServicios) {
      console.error(errorServicios)

      setError(
        'No se pudo cargar el historial.'
      )

      setCargando(false)
      return
    }

    const ids = (servicios || []).map((trabajo) => trabajo.id)

    let partes = []

    if (ids.length > 0) {
      const resultadoPartes = await supabase
        .from('service_parts')
        .select('*')
        .in('service_record_id', ids)

      if (!resultadoPartes.error) {
        partes = resultadoPartes.data || []
      }
    }

    let fotos = []
    if (ids.length > 0) {
      const resultadoFotos = await supabase
        .from('service_photos')
        .select('*')
        .in('service_record_id', ids)
        .order('created_at', { ascending: true })
      if (!resultadoFotos.error) fotos = resultadoFotos.data || []
    }

    setVehiculoPublico(vehiculo)
    setTrabajosPublicos((servicios || []).filter((trabajo) => !esPresupuesto(trabajo)))
    setPartesPublicos(partes)
    setFotosPublicas(fotos)

    setCargando(false)
  }

  function limpiarMensajes() {
    setMensaje('')
    setError('')
  }

  function irInicio() {
    limpiarMensajes()
    setPantalla('inicio')
  }

  function irVehiculos() {
    limpiarMensajes()
    setPantalla('vehiculos')
  }

  function irClientes() {
    limpiarMensajes()
    setPantalla('clientes')
  }

  function abrirVehiculo(vehiculo) {
    setVehiculoSeleccionado(vehiculo)

    const cliente = clientes.find(
      (item) => item.id === vehiculo.customer_id
    )

    setClienteSeleccionado(cliente || vehiculo.customers || null)

    limpiarMensajes()

    setPantalla('ficha')
  }

  function abrirCliente(cliente) {
    setClienteSeleccionado(cliente)

    limpiarMensajes()

    setPantalla('clienteDetalle')
  }

  function nuevoCliente() {
    limpiarMensajes()

    setFormCliente({
      nombre: '',
      telefono: '',
      email: '',
      direccion: '',
      observaciones: '',

      vehiculo_patente: '',
      vehiculo_marca: '',
      vehiculo_modelo: '',
      vehiculo_anio: '',
      vehiculo_vin: '',
      vehiculo_kilometraje: '',
      vehiculo_observaciones: '',
    })

    setPantalla('nuevoCliente')
  }

  function nuevoVehiculoParaCliente(cliente) {
    limpiarMensajes()

    setFormVehiculo({
      patente: '',
      marca: '',
      modelo: '',
      anio: '',
      vin: '',
      kilometraje: '',
      cliente_id: cliente.id,
      observaciones: '',
      foto_url: '',
    })
    setFotoVehiculo(null)

    setClienteSeleccionado(cliente)

    setPantalla('nuevo')
  }

  function nuevoVehiculo() {
    limpiarMensajes()

    setFormVehiculo({
      patente: '',
      marca: '',
      modelo: '',
      anio: '',
      vin: '',
      kilometraje: '',
      cliente_id: '',
      observaciones: '',
      foto_url: '',
    })
    setFotoVehiculo(null)

    setPantalla('nuevo')
  }

  function nuevoTrabajo() {
    if (!vehiculoSeleccionado) {
      setError('Primero seleccioná un vehículo.')
      return
    }

    limpiarMensajes()

    setFormTrabajo({
      fecha: fechaLocal(),
      kilometraje:
        vehiculoSeleccionado.kilometraje || '',
      tipo_trabajo: '',
      descripcion: '',
      observaciones: '',
      importe: '',
      programarMantenimiento: false,
      proximoKm: '',
      proximaFecha: '',
    })

    setPartesForm([])
    setFotosTrabajoForm([])
    setTrabajoFotos([])

    setTrabajoSeleccionado(null)

    setPantalla('nuevoTrabajo')
  }

  function nuevoPresupuesto() {
    if (!vehiculoSeleccionado) {
      setError('Primero seleccioná un vehículo.')
      return
    }

    limpiarMensajes()
    setFormTrabajo({
      fecha: fechaLocal(),
      kilometraje: vehiculoSeleccionado.kilometraje || '',
      tipo_trabajo: '',
      descripcion: '',
      observaciones: '',
      importe: '',
    })
    setPartesForm([])
    setPresupuestoSeleccionado(null)
    setPantalla('nuevoPresupuesto')
  }

  async function guardarPresupuesto(e) {
    e.preventDefault()
    if (!vehiculoSeleccionado) return
    limpiarMensajes()

    if (!formTrabajo.descripcion.trim()) {
      setError('Ingresá una descripción del presupuesto.')
      return
    }

    setGuardando(true)

    const payload = {
      vehicle_id: vehiculoSeleccionado.id,
      fecha: formTrabajo.fecha || fechaLocal(),
      kilometraje: formTrabajo.kilometraje ? Number(formTrabajo.kilometraje) : null,
      tipo_trabajo: `__PRESUPUESTO__|${formTrabajo.tipo_trabajo.trim() || 'General'}`,
      descripcion: formTrabajo.descripcion.trim(),
      observaciones: formTrabajo.observaciones.trim() || null,
      importe: formTrabajo.importe ? Number(formTrabajo.importe) : 0,
    }

    const { data: presupuesto, error } = await supabase
      .from('service_records')
      .insert(payload)
      .select('*')
      .single()

    if (error) {
      setError(`No se pudo guardar el presupuesto: ${error.message}`)
      setGuardando(false)
      return
    }

    const partesValidas = partesForm.filter((parte) => parte.nombre.trim() !== '')
    let partesGuardadas = []

    if (partesValidas.length > 0) {
      const resultado = await supabase
        .from('service_parts')
        .insert(partesValidas.map((parte) => ({
          service_record_id: presupuesto.id,
          nombre: parte.nombre.trim(),
          marca: parte.marca.trim() || null,
          cantidad: parte.cantidad ? Number(parte.cantidad) : 1,
          precio: parte.precio ? Number(parte.precio) : 0,
          observaciones: parte.observaciones.trim() || null,
        })))
        .select('*')

      if (resultado.error) {
        await supabase.from('service_records').delete().eq('id', presupuesto.id)
        setError(`No se pudo guardar el presupuesto: ${resultado.error.message}`)
        setGuardando(false)
        return
      }
      partesGuardadas = resultado.data || []
    }

    setTrabajos((actuales) => [presupuesto, ...actuales])
    setPresupuestoSeleccionado(presupuesto)
    setTrabajoPartes(partesGuardadas)
    setGuardando(false)
    setMensaje('Presupuesto guardado correctamente.')
    setTimeout(() => {
      setMensaje('')
      setPantalla('presupuestoDetalle')
    }, 700)
  }

  async function abrirPresupuesto(presupuesto) {
    limpiarMensajes()
    setCargando(true)
    const { data, error } = await supabase
      .from('service_parts')
      .select('*')
      .eq('service_record_id', presupuesto.id)

    if (error) {
      setError(`No se pudieron cargar los repuestos del presupuesto: ${error.message}`)
      setCargando(false)
      return
    }

    setPresupuestoSeleccionado(presupuesto)
    setTrabajoPartes(data || [])
    setCargando(false)
    setPantalla('presupuestoDetalle')
  }

  async function convertirPresupuesto() {
    if (!presupuestoSeleccionado) return
    if (!window.confirm('¿Convertir este presupuesto en trabajo realizado? Se incorporará al historial del vehículo.')) return

    setGuardando(true)
    limpiarMensajes()
    const nuevoTipo = tipoPresupuesto(presupuestoSeleccionado)

    const { data, error } = await supabase
      .from('service_records')
      .update({ tipo_trabajo: nuevoTipo })
      .eq('id', presupuestoSeleccionado.id)
      .select('*')
      .single()

    if (error) {
      setError(`No se pudo convertir el presupuesto: ${error.message}`)
      setGuardando(false)
      return
    }

    setTrabajos((actuales) => actuales.map((trabajo) => trabajo.id === data.id ? data : trabajo))
    setTrabajoSeleccionado(data)
    setPresupuestoSeleccionado(null)
    setGuardando(false)
    setMensaje('Presupuesto convertido en trabajo realizado.')
    setTimeout(() => {
      setMensaje('')
      setPantalla('trabajoDetalle')
    }, 700)
  }

  async function eliminarPresupuesto() {
    if (!presupuestoSeleccionado) return
    if (!window.confirm('¿Eliminar definitivamente este presupuesto?')) return

    setGuardando(true)
    limpiarMensajes()
    await supabase.from('service_parts').delete().eq('service_record_id', presupuestoSeleccionado.id)
    const { error } = await supabase.from('service_records').delete().eq('id', presupuestoSeleccionado.id)

    if (error) {
      setError(`No se pudo eliminar el presupuesto: ${error.message}`)
      setGuardando(false)
      return
    }

    setTrabajos((actuales) => actuales.filter((trabajo) => trabajo.id !== presupuestoSeleccionado.id))
    setPresupuestoSeleccionado(null)
    setTrabajoPartes([])
    setGuardando(false)
    setMensaje('Presupuesto eliminado correctamente.')
    setTimeout(() => {
      setMensaje('')
      setPantalla('presupuestos')
    }, 700)
  }

  function imprimirPresupuesto() {
    if (!presupuestoSeleccionado) return
    const cliente = vehiculoSeleccionado?.customers || clienteSeleccionado
    const numero = `PR-${String(presupuestoSeleccionado.id).slice(0, 8).toUpperCase()}`
    const manoObra = Number(presupuestoSeleccionado.importe || 0)
    const partes = trabajoPartes || []
    const total = manoObra + totalRepuestos(partes)
    const ventana = window.open('', '_blank', 'width=800,height=900')
    if (!ventana) return
    ventana.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Presupuesto ${numero}</title><style>body{font-family:Arial;max-width:760px;margin:auto;padding:35px;color:#222}.cab{display:flex;justify-content:space-between;border-bottom:2px solid #222;padding-bottom:18px}.fila{border-bottom:1px solid #ddd;padding:9px 0;display:flex;justify-content:space-between;gap:20px}.total{text-align:right;font-size:22px;font-weight:bold;margin-top:25px}.pie{text-align:center;color:#666;font-size:12px;margin-top:45px}</style></head><body><div class="cab"><div><h1>EL CHINO</h1><div>Taller Mecánico</div></div><div><strong>PRESUPUESTO</strong><br>${numero}<br>${formatoFecha(presupuestoSeleccionado.fecha)}</div></div><p><strong>Cliente:</strong> ${textoSeguro(cliente?.nombre)||'-'}</p><p><strong>Teléfono:</strong> ${textoSeguro(cliente?.telefono)||'-'}</p><p><strong>Vehículo:</strong> ${textoSeguro(vehiculoSeleccionado?.marca)} ${textoSeguro(vehiculoSeleccionado?.modelo)}</p><p><strong>Patente:</strong> ${textoSeguro(vehiculoSeleccionado?.patente)||'-'}</p><p><strong>Kilometraje:</strong> ${presupuestoSeleccionado.kilometraje ? presupuestoSeleccionado.kilometraje+' km':'-'}</p><h3>${textoSeguro(tipoPresupuesto(presupuestoSeleccionado))}</h3><p>${textoSeguro(presupuestoSeleccionado.descripcion)}</p>${presupuestoSeleccionado.observaciones?`<p><strong>Observaciones:</strong> ${textoSeguro(presupuestoSeleccionado.observaciones)}</p>`:''}${partes.length?`<h3>Repuestos</h3>${partes.map(x=>`<div class="fila"><div><strong>${textoSeguro(x.nombre)}</strong>${x.marca?' — '+textoSeguro(x.marca):''} × ${x.cantidad||1}</div><div>${formatoImporte(Number(x.precio||0)*Number(x.cantidad||1))}</div></div>`).join('')}`:''}<div class="fila"><div><strong>Mano de obra</strong></div><div>${formatoImporte(manoObra)}</div></div><div class="total">TOTAL: ${formatoImporte(total)}</div><div class="pie">Presupuesto interno de EL CHINO. No constituye por sí mismo una factura electrónica fiscal.<br>Valores sujetos a confirmación antes de realizar el trabajo.</div></body></html>`)
    ventana.document.close(); ventana.focus(); ventana.print()
  }

  function compartirPresupuestoWhatsApp() {
    if (!presupuestoSeleccionado) return
    const partes = trabajoPartes || []
    const manoObra = Number(presupuestoSeleccionado.importe || 0)
    const total = manoObra + totalRepuestos(partes)
    const lineas = [
      '*EL CHINO – Taller Mecánico*',
      '*PRESUPUESTO*',
      `Vehículo: ${vehiculoSeleccionado?.marca || ''} ${vehiculoSeleccionado?.modelo || ''}`.trim(),
      `Patente: ${vehiculoSeleccionado?.patente || '-'}`,
      `Trabajo: ${tipoPresupuesto(presupuestoSeleccionado)}`,
      `Descripción: ${presupuestoSeleccionado.descripcion || '-'}`,
      '',
      ...partes.map((parte) => `• ${parte.nombre}${parte.marca ? ` (${parte.marca})` : ''} x${parte.cantidad || 1}: ${formatoImporte(Number(parte.precio || 0) * Number(parte.cantidad || 1))}`),
      `• Mano de obra: ${formatoImporte(manoObra)}`,
      `*TOTAL: ${formatoImporte(total)}*`,
      '',
      'Presupuesto sujeto a confirmación antes de realizar el trabajo.',
    ]
    window.open(`https://wa.me/?text=${encodeURIComponent(lineas.join('\\n'))}`, '_blank')
  }

  function cambiarVehiculo(e) {
    setFormVehiculo({
      ...formVehiculo,
      [e.target.name]: e.target.value,
    })
  }

  function abrirMantenimiento() {
    if (!vehiculoSeleccionado) return
    const actual = obtenerMantenimiento(vehiculoSeleccionado)
    setFormMantenimiento({
      tipo: actual?.tipo || 'Cambio de aceite y filtros',
      fechaUltimo: actual?.fechaUltimo || '',
      kmUltimo: actual?.kmUltimo || vehiculoSeleccionado.kilometraje || '',
      kmProximo: actual?.kmProximo || '',
      fechaProxima: actual?.fechaProxima || '',
      notas: actual?.notas || '',
    })
    limpiarMensajes()
    setMostrarMantenimiento(true)
  }

  function cambiarMantenimiento(e) {
    setFormMantenimiento({ ...formMantenimiento, [e.target.name]: e.target.value })
  }

  async function guardarMantenimiento(e) {
    e.preventDefault()
    if (!vehiculoSeleccionado) return
    limpiarMensajes()
    if (!formMantenimiento.kmProximo && !formMantenimiento.fechaProxima) {
      setError('Ingresá el próximo kilometraje, la próxima fecha o ambos.')
      return
    }
    setGuardando(true)
    const mantenimiento = {
      tipo: formMantenimiento.tipo.trim() || 'Mantenimiento',
      fechaUltimo: formMantenimiento.fechaUltimo || null,
      kmUltimo: formMantenimiento.kmUltimo ? Number(formMantenimiento.kmUltimo) : null,
      kmProximo: formMantenimiento.kmProximo ? Number(formMantenimiento.kmProximo) : null,
      fechaProxima: formMantenimiento.fechaProxima || null,
      notas: formMantenimiento.notas.trim() || null,
    }
    const { data, error } = await supabase.from('vehicles').update({
      observaciones: construirObservacionesConMantenimiento(vehiculoSeleccionado.observaciones, mantenimiento),
    }).eq('id', vehiculoSeleccionado.id).select('*, customers(*)').single()
    if (error) {
      setError(`No se pudo guardar el próximo service: ${error.message}`)
      setGuardando(false)
      return
    }
    setVehiculoSeleccionado(data)
    setVehiculos((actuales) => actuales.map((v) => v.id === data.id ? data : v))
    setMostrarMantenimiento(false)
    setGuardando(false)
    setMensaje('Próximo service guardado correctamente.')
    setTimeout(() => setMensaje(''), 1800)
  }

  function cambiarFotoVehiculo(e) {
    setFotoVehiculo(e.target.files?.[0] || null)
  }

  function cambiarCliente(e) {
    setFormCliente({
      ...formCliente,
      [e.target.name]: e.target.value,
    })
  }

  function cambiarTrabajo(e) {
    setFormTrabajo({
      ...formTrabajo,
      [e.target.name]: e.target.value,
    })
  }

  function cambiarFotosTrabajo(e) {
    setFotosTrabajoForm(Array.from(e.target.files || []))
  }

  function agregarParte() {
    setPartesForm([
      ...partesForm,
      {
        nombre: '',
        marca: '',
        cantidad: '1',
        precio: '',
        observaciones: '',
      },
    ])
  }

  function cargarKitLubricentro() {
    const kit = [
      'ACEITE DE MOTOR',
      'FILTRO DE COMBUSTIBLE',
      'FILTRO DE AIRE',
      'FILTRO DE HABITÁCULO',
      'FILTRO DE ACEITE',
      'REFRIGERANTE',
      'ACEITE DE CAJA',
    ]

    setPartesForm([
      ...partesForm,
      ...kit.map((nombre) => ({
        nombre,
        marca: '',
        cantidad: '1',
        precio: '',
        observaciones: '',
      })),
    ])
  }

  function cambiarParte(indice, campo, valor) {
    const nuevasPartes = [...partesForm]

    nuevasPartes[indice] = {
      ...nuevasPartes[indice],
      [campo]: valor,
    }

    setPartesForm(nuevasPartes)
  }

  function eliminarParte(indice) {
    setPartesForm(
      partesForm.filter(
        (_, index) => index !== indice
      )
    )
  }

  async function guardarCliente(e) {
    e.preventDefault()

    limpiarMensajes()

    if (!formCliente.nombre.trim()) {
      setError('Ingresá el nombre del cliente.')
      return
    }

    if (!formCliente.vehiculo_patente.trim()) {
      setError('Ingresá la patente del vehículo.')
      return
    }

    if (!formCliente.vehiculo_marca.trim()) {
      setError('Ingresá la marca del vehículo.')
      return
    }

    if (!formCliente.vehiculo_modelo.trim()) {
      setError('Ingresá el modelo del vehículo.')
      return
    }

    setGuardando(true)

    const datosCliente = {
      nombre: formCliente.nombre.trim(),
      telefono:
        formCliente.telefono.trim() || null,
      email:
        formCliente.email.trim() || null,
      direccion:
        formCliente.direccion.trim() || null,
      observaciones:
        formCliente.observaciones.trim() || null,
    }

    const { data: cliente, error: errorCliente } =
      await supabase
        .from('customers')
        .insert(datosCliente)
        .select('*')
        .single()

    if (errorCliente) {
      console.error(errorCliente)

      setError(
        `No se pudo guardar el cliente: ${errorCliente.message}`
      )

      setGuardando(false)
      return
    }

    const datosVehiculo = {
      patente:
        formCliente.vehiculo_patente
          .trim()
          .toUpperCase(),

      marca:
        formCliente.vehiculo_marca.trim(),

      modelo:
        formCliente.vehiculo_modelo.trim(),

      anio: formCliente.vehiculo_anio
        ? Number(formCliente.vehiculo_anio)
        : null,

      vin:
        formCliente.vehiculo_vin.trim() || null,

      kilometraje:
        formCliente.vehiculo_kilometraje
          ? Number(formCliente.vehiculo_kilometraje)
          : null,

      customer_id: cliente.id,

      observaciones:
        formCliente.vehiculo_observaciones.trim() ||
        null,
    }

    const {
      data: vehiculo,
      error: errorVehiculo,
    } = await supabase
      .from('vehicles')
      .insert(datosVehiculo)
      .select('*, customers(*)')
      .single()

    if (errorVehiculo) {
      console.error(errorVehiculo)

      await supabase
        .from('customers')
        .delete()
        .eq('id', cliente.id)

      setError(
        `El cliente se creó pero no se pudo guardar el vehículo: ${errorVehiculo.message}`
      )

      setGuardando(false)
      return
    }

    setClientes((actuales) => [
      cliente,
      ...actuales,
    ])

    setVehiculos((actuales) => [
      vehiculo,
      ...actuales,
    ])

    setClienteSeleccionado(cliente)
    setVehiculoSeleccionado(vehiculo)

    setMensaje(
      'Cliente y vehículo guardados correctamente.'
    )

    setGuardando(false)

    setTimeout(() => {
      setMensaje('')
      setPantalla('ficha')
    }, 700)
  }

  async function guardarVehiculo(e) {
    e.preventDefault()

    limpiarMensajes()

    if (!formVehiculo.patente.trim()) {
      setError('Ingresá la patente.')
      return
    }

    if (!formVehiculo.marca.trim()) {
      setError('Ingresá la marca.')
      return
    }

    if (!formVehiculo.modelo.trim()) {
      setError('Ingresá el modelo.')
      return
    }

    setGuardando(true)

    const payload = {
      patente:
        formVehiculo.patente
          .trim()
          .toUpperCase(),

      marca:
        formVehiculo.marca.trim(),

      modelo:
        formVehiculo.modelo.trim(),

      anio: formVehiculo.anio
        ? Number(formVehiculo.anio)
        : null,

      vin:
        formVehiculo.vin.trim() || null,

      kilometraje:
        formVehiculo.kilometraje
          ? Number(formVehiculo.kilometraje)
          : null,

      customer_id:
        formVehiculo.cliente_id || null,

      observaciones:
        formVehiculo.observaciones.trim() ||
        null,
    }

    const {
      data: vehiculo,
      error: errorVehiculo,
    } = await supabase
      .from('vehicles')
      .insert(payload)
      .select('*, customers(*)')
      .single()

    if (errorVehiculo) {
      console.error(errorVehiculo)

      setError(
        `No se pudo guardar el vehículo: ${errorVehiculo.message}`
      )

      setGuardando(false)
      return
    }

    let vehiculoFinal = vehiculo
    if (fotoVehiculo) {
      try {
        const fotoUrl = await subirFotoVehiculo(fotoVehiculo, vehiculo.id)
        const { data: actualizado, error: errorFoto } = await supabase.from('vehicles').update({ foto_url: fotoUrl }).eq('id', vehiculo.id).select('*, customers(*)').single()
        if (errorFoto) throw errorFoto
        vehiculoFinal = actualizado
      } catch (e) {
        setError(`Vehículo guardado, pero no se pudo subir la foto: ${e.message}`)
      }
    }

    setVehiculos((actuales) => [
      vehiculoFinal,
      ...actuales,
    ])

    setVehiculoSeleccionado(vehiculoFinal)
    setFotoVehiculo(null)

    setMensaje(
      formVehiculo.cliente_id
        ? 'Vehículo agregado correctamente.'
        : 'Vehículo guardado correctamente.'
    )

    setGuardando(false)

    setTimeout(() => {
      setMensaje('')
      setPantalla('ficha')
    }, 700)
  }

  async function guardarTrabajo(e) {
    e.preventDefault()

    limpiarMensajes()

    if (!vehiculoSeleccionado) {
      setError('No hay un vehículo seleccionado.')
      return
    }

    if (!formTrabajo.fecha) {
      setError('Ingresá la fecha.')
      return
    }

    if (!formTrabajo.descripcion.trim()) {
      setError(
        'Ingresá una descripción del trabajo realizado.'
      )
      return
    }

    setGuardando(true)

    const payload = {
      vehicle_id: vehiculoSeleccionado.id,

      fecha: formTrabajo.fecha,

      kilometraje:
        formTrabajo.kilometraje
          ? Number(formTrabajo.kilometraje)
          : null,

      tipo_trabajo:
        formTrabajo.tipo_trabajo.trim() ||
        null,

      descripcion:
        formTrabajo.descripcion.trim(),

      observaciones:
        formTrabajo.observaciones.trim() ||
        null,

      importe:
        formTrabajo.importe
          ? Number(formTrabajo.importe)
          : null,
    }

    const {
      data: trabajo,
      error: errorTrabajo,
    } = await supabase
      .from('service_records')
      .insert(payload)
      .select('*')
      .single()

    if (errorTrabajo) {
      console.error(errorTrabajo)

      setError(
        `No se pudo guardar el trabajo: ${errorTrabajo.message}`
      )

      setGuardando(false)
      return
    }

    const partesValidas = partesForm.filter(
      (parte) => parte.nombre.trim() !== ''
    )

    if (partesValidas.length > 0) {
      const datosPartes = partesValidas.map(
        (parte) => ({
          service_record_id: trabajo.id,

          nombre:
            parte.nombre.trim(),

          marca:
            parte.marca.trim() || null,

          cantidad:
            parte.cantidad
              ? Number(parte.cantidad)
              : 1,

          precio:
            parte.precio
              ? Number(parte.precio)
              : 0,

          observaciones:
            parte.observaciones.trim() ||
            null,
        })
      )

      const {
        error: errorPartes,
      } = await supabase
        .from('service_parts')
        .insert(datosPartes)

      if (errorPartes) {
        console.error(errorPartes)

        setError(
          `El trabajo se guardó, pero hubo un problema con los repuestos: ${errorPartes.message}`
        )

        setGuardando(false)
        return
      }
    }

    let fotosGuardadas = []
    if (fotosTrabajoForm.length > 0) {
      try {
        fotosGuardadas = await subirFotosTrabajo(fotosTrabajoForm, trabajo.id, vehiculoSeleccionado.id)
      } catch (e) {
        setError(`El trabajo se guardó, pero no se pudieron subir las fotos: ${e.message}`)
      }
    }

    const kilometrajeNuevo = formTrabajo.kilometraje
      ? Number(formTrabajo.kilometraje)
      : null

    const kilometrajeActual =
      Number(
        vehiculoSeleccionado.kilometraje || 0
      )

    if (
      kilometrajeNuevo &&
      kilometrajeNuevo > kilometrajeActual
    ) {
      const { data: vehiculoActualizado, error } =
        await supabase
          .from('vehicles')
          .update({
            kilometraje: kilometrajeNuevo,
          })
          .eq(
            'id',
            vehiculoSeleccionado.id
          )
          .select('*, customers(*)')
          .single()

      if (!error && vehiculoActualizado) {
        setVehiculoSeleccionado(
          vehiculoActualizado
        )

        setVehiculos((actuales) =>
          actuales.map((vehiculo) =>
            vehiculo.id ===
            vehiculoActualizado.id
              ? vehiculoActualizado
              : vehiculo
          )
        )
      }
    }

    const debeProgramarMantenimiento =
      Boolean(formTrabajo.programarMantenimiento) ||
      Boolean(formTrabajo.proximoKm) ||
      Boolean(formTrabajo.proximaFecha)

    if (debeProgramarMantenimiento) {
      const vehiculoParaMantenimiento =
        kilometrajeNuevo && kilometrajeNuevo > kilometrajeActual
          ? { ...vehiculoSeleccionado, kilometraje: kilometrajeNuevo }
          : vehiculoSeleccionado

      if (!formTrabajo.proximoKm && !formTrabajo.proximaFecha) {
        setError('El trabajo se guardó, pero falta indicar el próximo kilometraje o la próxima fecha del mantenimiento.')
      } else {
        const mantenimiento = {
          tipo: formTrabajo.tipo_trabajo.trim() || 'Mantenimiento',
          fechaUltimo: formTrabajo.fecha || null,
          kmUltimo: kilometrajeNuevo || Number(vehiculoParaMantenimiento.kilometraje || 0) || null,
          kmProximo: formTrabajo.proximoKm ? Number(formTrabajo.proximoKm) : null,
          fechaProxima: formTrabajo.proximaFecha || null,
          notas: null,
        }

        const resultadoMantenimiento = await supabase
          .from('vehicles')
          .update({
            observaciones: construirObservacionesConMantenimiento(vehiculoParaMantenimiento.observaciones, mantenimiento),
          })
          .eq('id', vehiculoSeleccionado.id)
          .select('*, customers(*)')
          .single()

        if (resultadoMantenimiento.error) {
          setError(`El trabajo se guardó, pero no se pudo guardar el próximo service: ${resultadoMantenimiento.error.message}`)
        } else {
          setVehiculoSeleccionado(resultadoMantenimiento.data)
          setVehiculos((actuales) => actuales.map((v) => v.id === resultadoMantenimiento.data.id ? resultadoMantenimiento.data : v))
        }
      }
    }

    setTrabajos((actuales) => [
      trabajo,
      ...actuales,
    ])

    setMensaje(
      'Trabajo guardado correctamente.'
    )

    setTrabajoPartes(
      partesValidas.map((parte, indice) => ({
        id: `nuevo-${indice}`,
        service_record_id: trabajo.id,
        nombre: parte.nombre.trim(),
        marca: parte.marca.trim() || null,
        cantidad: parte.cantidad ? Number(parte.cantidad) : 1,
        precio: parte.precio ? Number(parte.precio) : 0,
        observaciones: parte.observaciones.trim() || null,
      }))
    )

    setGuardando(false)

    setFormTrabajo({
      fecha: fechaLocal(),
      kilometraje:
        kilometrajeNuevo || '',
      tipo_trabajo: '',
      descripcion: '',
      observaciones: '',
      importe: '',
      programarMantenimiento: false,
      proximoKm: '',
      proximaFecha: '',
    })

    setPartesForm([])
    setFotosTrabajoForm([])
    setTrabajoFotos(fotosGuardadas)

    setTimeout(() => {
      setMensaje('')
      setPantalla('ficha')
    }, 800)
  }

  async function abrirHistorial() {
    limpiarMensajes()

    setCargando(true)

    const { data, error } = await supabase
      .from('service_records')
      .select('*')
      .eq(
        'vehicle_id',
        vehiculoSeleccionado.id
      )
      .order('fecha', {
        ascending: false,
      })

    if (error) {
      setError(
        `No se pudo cargar el historial: ${error.message}`
      )

      setCargando(false)
      return
    }

    setTrabajos(data || [])

    setCargando(false)

    setPantalla('historial')
  }

  async function abrirTrabajo(trabajo) {
    limpiarMensajes()

    setCargando(true)

    const { data, error } = await supabase
      .from('service_parts')
      .select('*')
      .eq(
        'service_record_id',
        trabajo.id
      )

    if (error) {
      console.error(error)
      setError(
        `No se pudieron cargar los repuestos: ${error.message}`
      )
    }

    const { data: fotos, error: errorFotos } = await supabase
      .from('service_photos')
      .select('*')
      .eq('service_record_id', trabajo.id)
      .order('created_at', { ascending: true })

    if (errorFotos) console.error(errorFotos)

    setTrabajoSeleccionado(trabajo)
    setTrabajoPartes(data || [])
    setTrabajoFotos(fotos || [])

    setCargando(false)

    setPantalla('trabajoDetalle')
  }

  async function eliminarTrabajo() {
    if (!trabajoSeleccionado) return

    const confirmar = window.confirm(
      '¿Seguro que querés eliminar este trabajo? Esta acción no se puede deshacer.'
    )

    if (!confirmar) return

    setGuardando(true)
    limpiarMensajes()

    await supabase
      .from('service_parts')
      .delete()
      .eq(
        'service_record_id',
        trabajoSeleccionado.id
      )

    const { error } = await supabase
      .from('service_records')
      .delete()
      .eq(
        'id',
        trabajoSeleccionado.id
      )

    if (error) {
      setError(
        `No se pudo eliminar: ${error.message}`
      )

      setGuardando(false)
      return
    }

    setTrabajos((actuales) =>
      actuales.filter(
        (trabajo) =>
          trabajo.id !==
          trabajoSeleccionado.id
      )
    )

    setTrabajoSeleccionado(null)
    setTrabajoPartes([])

    setGuardando(false)

    setMensaje(
      'Trabajo eliminado correctamente.'
    )

    setTimeout(() => {
      setMensaje('')
      setPantalla('historial')
    }, 700)
  }

  async function editarTrabajo() {
    if (!trabajoSeleccionado) return

    setFormTrabajo({
      fecha:
        trabajoSeleccionado.fecha ||
        fechaLocal(),

      kilometraje:
        trabajoSeleccionado.kilometraje ||
        '',

      tipo_trabajo:
        trabajoSeleccionado.tipo_trabajo ||
        '',

      descripcion:
        trabajoSeleccionado.descripcion ||
        '',

      observaciones:
        trabajoSeleccionado.observaciones ||
        '',

      importe:
        trabajoSeleccionado.importe ||
        '',
    })

    setPartesForm(
      trabajoPartes.map((parte) => ({
        nombre: textoSeguro(parte.nombre),
        marca: textoSeguro(parte.marca),
        cantidad:
          parte.cantidad?.toString() || '1',
        precio:
          parte.precio?.toString() || '',
        observaciones:
          textoSeguro(parte.observaciones),
      }))
    )

    setPantalla('editarTrabajo')
  }

  async function actualizarTrabajo(e) {
    e.preventDefault()

    if (!trabajoSeleccionado) return

    limpiarMensajes()

    if (!formTrabajo.descripcion.trim()) {
      setError(
        'Ingresá una descripción del trabajo.'
      )
      return
    }

    setGuardando(true)

    const payload = {
      fecha: formTrabajo.fecha,

      kilometraje:
        formTrabajo.kilometraje
          ? Number(formTrabajo.kilometraje)
          : null,

      tipo_trabajo:
        formTrabajo.tipo_trabajo.trim() ||
        null,

      descripcion:
        formTrabajo.descripcion.trim(),

      observaciones:
        formTrabajo.observaciones.trim() ||
        null,

      importe:
        formTrabajo.importe
          ? Number(formTrabajo.importe)
          : null,
    }

    const { error: errorTrabajo } = await supabase
      .from('service_records')
      .update(payload)
      .eq('id', trabajoSeleccionado.id)

    if (errorTrabajo) {
      setError(
        `No se pudo actualizar: ${errorTrabajo.message}`
      )

      setGuardando(false)
      return
    }

    const trabajoActualizado = {
      ...trabajoSeleccionado,
      ...payload,
    }

    await supabase
      .from('service_parts')
      .delete()
      .eq(
        'service_record_id',
        trabajoSeleccionado.id
      )

    const partesValidas = partesForm.filter(
      (parte) =>
        parte.nombre.trim() !== ''
    )

    let partesGuardadas = []

    if (partesValidas.length > 0) {
      const resultadoPartes = await supabase
        .from('service_parts')
        .insert(
          partesValidas.map((parte) => ({
            service_record_id:
              trabajoSeleccionado.id,

            nombre:
              parte.nombre.trim(),

            marca:
              parte.marca.trim() ||
              null,

            cantidad:
              parte.cantidad
                ? Number(parte.cantidad)
                : 1,

            precio:
              parte.precio
                ? Number(parte.precio)
                : 0,

            observaciones:
              parte.observaciones.trim() ||
              null,
          }))
        )
        .select('*')

      if (resultadoPartes.error) {
        setError(`El trabajo se actualizó, pero no se pudieron guardar los repuestos: ${resultadoPartes.error.message}`)
        setGuardando(false)
        return
      }

      partesGuardadas = resultadoPartes.data || []
    }

    setTrabajoPartes(partesGuardadas)

    setTrabajos((actuales) =>
      actuales.map((trabajo) =>
        trabajo.id ===
        trabajoActualizado.id
          ? trabajoActualizado
          : trabajo
      )
    )

    setTrabajoSeleccionado(
      trabajoActualizado
    )

    setGuardando(false)

    setMensaje(
      'Trabajo actualizado correctamente.'
    )

    setTimeout(() => {
      setMensaje('')
      setPantalla('trabajoDetalle')
    }, 700)
  }

  function editarVehiculo() {
    if (!vehiculoSeleccionado) return

    setFormVehiculo({
      patente:
        textoSeguro(
          vehiculoSeleccionado.patente
        ),

      marca:
        textoSeguro(
          vehiculoSeleccionado.marca
        ),

      modelo:
        textoSeguro(
          vehiculoSeleccionado.modelo
        ),

      anio:
        vehiculoSeleccionado.anio ||
        '',

      vin:
        textoSeguro(
          vehiculoSeleccionado.vin
        ),

      kilometraje:
        vehiculoSeleccionado.kilometraje ||
        '',

      cliente_id:
        vehiculoSeleccionado.customer_id ||
        '',

      observaciones:
        textoSeguro(
          vehiculoSeleccionado.observaciones
        ),
      foto_url: textoSeguro(vehiculoSeleccionado.foto_url),
    })
    setFotoVehiculo(null)

    setPantalla('editarVehiculo')
  }

  async function actualizarVehiculo(e) {
    e.preventDefault()

    if (!vehiculoSeleccionado) return

    limpiarMensajes()

    if (!formVehiculo.patente.trim()) {
      setError('Ingresá la patente.')
      return
    }

    if (!formVehiculo.marca.trim()) {
      setError('Ingresá la marca.')
      return
    }

    if (!formVehiculo.modelo.trim()) {
      setError('Ingresá el modelo.')
      return
    }

    setGuardando(true)

    const payload = {
      patente:
        formVehiculo.patente
          .trim()
          .toUpperCase(),

      marca:
        formVehiculo.marca.trim(),

      modelo:
        formVehiculo.modelo.trim(),

      anio:
        formVehiculo.anio
          ? Number(formVehiculo.anio)
          : null,

      vin:
        formVehiculo.vin.trim() ||
        null,

      kilometraje:
        formVehiculo.kilometraje
          ? Number(formVehiculo.kilometraje)
          : null,

      customer_id:
        formVehiculo.cliente_id ||
        null,

      observaciones: construirObservacionesConMantenimiento(
        formVehiculo.observaciones.trim(),
        obtenerMantenimiento(vehiculoSeleccionado)
      ),
    }

    const {
      data,
      error,
    } = await supabase
      .from('vehicles')
      .update(payload)
      .eq(
        'id',
        vehiculoSeleccionado.id
      )
      .select('*, customers(*)')
      .single()

    if (error) {
      setError(
        `No se pudo actualizar el vehículo: ${error.message}`
      )

      setGuardando(false)
      return
    }

    let vehiculoFinal = data
    if (fotoVehiculo) {
      try {
        const fotoUrl = await subirFotoVehiculo(fotoVehiculo, data.id)
        const { data: actualizado, error: errorFoto } = await supabase.from('vehicles').update({ foto_url: fotoUrl }).eq('id', data.id).select('*, customers(*)').single()
        if (errorFoto) throw errorFoto
        vehiculoFinal = actualizado
      } catch (e) {
        setError(`Vehículo actualizado, pero no se pudo subir la foto: ${e.message}`)
      }
    }

    setVehiculoSeleccionado(vehiculoFinal)

    setVehiculos((actuales) =>
      actuales.map((vehiculo) =>
        vehiculo.id === data.id
          ? vehiculoFinal
          : vehiculo
      )
    )
    setFotoVehiculo(null)

    setGuardando(false)

    setMensaje(
      'Vehículo actualizado correctamente.'
    )

    setTimeout(() => {
      setMensaje('')
      setPantalla('ficha')
    }, 700)
  }

  function editarCliente() {
    if (!clienteSeleccionado) return

    setFormCliente({
      nombre:
        textoSeguro(
          clienteSeleccionado.nombre
        ),

      telefono:
        textoSeguro(
          clienteSeleccionado.telefono
        ),

      email:
        textoSeguro(
          clienteSeleccionado.email
        ),

      direccion:
        textoSeguro(
          clienteSeleccionado.direccion
        ),

      observaciones:
        textoSeguro(
          clienteSeleccionado.observaciones
        ),

      vehiculo_patente: '',
      vehiculo_marca: '',
      vehiculo_modelo: '',
      vehiculo_anio: '',
      vehiculo_vin: '',
      vehiculo_kilometraje: '',
      vehiculo_observaciones: '',
    })

    setPantalla('editarCliente')
  }

  async function actualizarCliente(e) {
    e.preventDefault()

    if (!clienteSeleccionado) return

    limpiarMensajes()

    if (!formCliente.nombre.trim()) {
      setError('Ingresá el nombre.')
      return
    }

    setGuardando(true)

    const payload = {
      nombre:
        formCliente.nombre.trim(),

      telefono:
        formCliente.telefono.trim() ||
        null,

      email:
        formCliente.email.trim() ||
        null,

      direccion:
        formCliente.direccion.trim() ||
        null,

      observaciones:
        formCliente.observaciones.trim() ||
        null,
    }

    const {
      data,
      error,
    } = await supabase
      .from('customers')
      .update(payload)
      .eq(
        'id',
        clienteSeleccionado.id
      )
      .select('*')
      .single()

    if (error) {
      setError(
        `No se pudo actualizar el cliente: ${error.message}`
      )

      setGuardando(false)
      return
    }

    setClienteSeleccionado(data)

    setClientes((actuales) =>
      actuales.map((cliente) =>
        cliente.id === data.id
          ? data
          : cliente
      )
    )

    setVehiculos((actuales) =>
      actuales.map((vehiculo) => {
        if (
          vehiculo.customer_id ===
          data.id
        ) {
          return {
            ...vehiculo,
            customers: data,
          }
        }

        return vehiculo
      })
    )

    setGuardando(false)

    setMensaje(
      'Cliente actualizado correctamente.'
    )

    setTimeout(() => {
      setMensaje('')
      setPantalla('clienteDetalle')
    }, 700)
  }

  function obtenerVehiculosCliente(clienteId) {
    return vehiculos.filter(
      (vehiculo) =>
        vehiculo.customer_id ===
        clienteId
    )
  }

  const vehiculosFiltrados = useMemo(() => {
    const texto =
      busquedaVehiculo
        .toLowerCase()
        .trim()

    if (!texto) return vehiculos

    return vehiculos.filter(
      (vehiculo) => {
        const cliente =
          vehiculo.customers

        return (
          vehiculo.patente
            ?.toLowerCase()
            .includes(texto) ||

          vehiculo.marca
            ?.toLowerCase()
            .includes(texto) ||

          vehiculo.modelo
            ?.toLowerCase()
            .includes(texto) ||

          vehiculo.vin
            ?.toLowerCase()
            .includes(texto) ||

          cliente?.nombre
            ?.toLowerCase()
            .includes(texto) ||

          cliente?.telefono
            ?.toLowerCase()
            .includes(texto)
        )
      }
    )
  }, [vehiculos, busquedaVehiculo])

  const clientesFiltrados = useMemo(() => {
    const texto =
      busquedaCliente
        .toLowerCase()
        .trim()

    if (!texto) return clientes

    return clientes.filter(
      (cliente) =>
        cliente.nombre
          ?.toLowerCase()
          .includes(texto) ||

        cliente.telefono
          ?.toLowerCase()
          .includes(texto) ||

        cliente.email
          ?.toLowerCase()
          .includes(texto) ||

        cliente.direccion
          ?.toLowerCase()
          .includes(texto)
    )
  }, [clientes, busquedaCliente])

  const trabajosVehiculo = useMemo(() => {
    if (!vehiculoSeleccionado) return []

    return trabajos
      .filter(
        (trabajo) =>
          trabajo.vehicle_id ===
          vehiculoSeleccionado.id &&
          !esPresupuesto(trabajo)
      )
      .sort(
        (a, b) =>
          new Date(b.fecha) -
          new Date(a.fecha)
      )
  }, [trabajos, vehiculoSeleccionado])

  const totalHistoricoVehiculo = useMemo(() => {
    return trabajosVehiculo.reduce(
      (total, trabajo) =>
        total + Number(
          trabajo.importe || 0
        ),
      0
    )
  }, [trabajosVehiculo])

  const presupuestos = useMemo(() => {
    return trabajos
      .filter((trabajo) => esPresupuesto(trabajo))
      .sort((a, b) => new Date(b.fecha) - new Date(a.fecha))
  }, [trabajos])

  const presupuestosVehiculo = useMemo(() => {
    if (!vehiculoSeleccionado) return []
    return presupuestos.filter((presupuesto) => presupuesto.vehicle_id === vehiculoSeleccionado.id)
  }, [presupuestos, vehiculoSeleccionado])

  function urlPublicaVehiculo(vehiculo) {
    return (
      "https://taller-el-chino.vercel.app/" +
      `?vehiculo=${vehiculo.id}`
    )
  }

  function abrirQR() {
    setMostrarQR(true)
  }

  async function subirFotoVehiculo(archivo, vehiculoId) {
    if (!archivo) return null
    const extension = archivo.name.split('.').pop()?.toLowerCase() || 'jpg'
    const ruta = `${vehiculoId}/${Date.now()}.${extension}`
    const { error } = await supabase.storage.from('vehiculos-fotos').upload(ruta, archivo, {
      upsert: true,
      contentType: archivo.type || 'image/jpeg',
    })
    if (error) throw error
    const { data } = supabase.storage.from('vehiculos-fotos').getPublicUrl(ruta)
    return data.publicUrl
  }

  async function subirFotosTrabajo(archivos, trabajoId, vehiculoId) {
    const fotosGuardadas = []
    for (const archivo of archivos || []) {
      const nombreSeguro = archivo.name.replace(/[^a-zA-Z0-9._-]/g, '_')
      const ruta = `${vehiculoId}/${trabajoId}/${Date.now()}-${nombreSeguro}`
      const { error: errorUpload } = await supabase.storage
        .from('trabajos-fotos')
        .upload(ruta, archivo, { upsert: false, contentType: archivo.type || 'image/jpeg' })
      if (errorUpload) throw errorUpload
      const { data: urlData } = supabase.storage.from('trabajos-fotos').getPublicUrl(ruta)
      const { data: foto, error: errorFoto } = await supabase
        .from('service_photos')
        .insert({ service_record_id: trabajoId, vehicle_id: vehiculoId, foto_url: urlData.publicUrl, nombre_archivo: archivo.name })
        .select('*').single()
      if (errorFoto) throw errorFoto
      fotosGuardadas.push(foto)
    }
    return fotosGuardadas
  }

  async function eliminarVehiculo() {
    if (!vehiculoSeleccionado) return
    if (!window.confirm(`¿Eliminar definitivamente el vehículo ${vehiculoSeleccionado.patente}?\n\nTambién se eliminarán su historial y repuestos.`)) return
    setGuardando(true)
    limpiarMensajes()
    const { data: registros, error: e1 } = await supabase.from('service_records').select('id').eq('vehicle_id', vehiculoSeleccionado.id)
    if (e1) { setError(`No se pudo preparar la eliminación: ${e1.message}`); setGuardando(false); return }
    const ids = (registros || []).map(x => x.id)
    if (ids.length) {
      const { error: e2 } = await supabase.from('service_parts').delete().in('service_record_id', ids)
      if (e2) { setError(`No se pudieron eliminar los repuestos: ${e2.message}`); setGuardando(false); return }
      const { error: e3 } = await supabase.from('service_records').delete().eq('vehicle_id', vehiculoSeleccionado.id)
      if (e3) { setError(`No se pudo eliminar el historial: ${e3.message}`); setGuardando(false); return }
    }
    const { error } = await supabase.from('vehicles').delete().eq('id', vehiculoSeleccionado.id)
    if (error) { setError(`No se pudo eliminar el vehículo: ${error.message}`); setGuardando(false); return }
    setVehiculos(a => a.filter(v => v.id !== vehiculoSeleccionado.id))
    setVehiculoSeleccionado(null)
    setClienteSeleccionado(null)
    setGuardando(false)
    setMensaje('Vehículo eliminado correctamente.')
    setTimeout(() => { setMensaje(''); setPantalla('vehiculos') }, 700)
  }

  async function eliminarCliente() {
    if (!clienteSeleccionado) return
    const vehiculosCliente = obtenerVehiculosCliente(clienteSeleccionado.id)
    if (vehiculosCliente.length) {
      setError('No se puede eliminar este cliente porque todavía tiene vehículos. Eliminá o reasigná primero sus vehículos.')
      return
    }
    if (!window.confirm(`¿Eliminar definitivamente al cliente ${clienteSeleccionado.nombre}?`)) return
    setGuardando(true)
    limpiarMensajes()
    const { error } = await supabase.from('customers').delete().eq('id', clienteSeleccionado.id)
    if (error) { setError(`No se pudo eliminar el cliente: ${error.message}`); setGuardando(false); return }
    setClientes(a => a.filter(c => c.id !== clienteSeleccionado.id))
    setClienteSeleccionado(null)
    setGuardando(false)
    setMensaje('Cliente eliminado correctamente.')
    setTimeout(() => { setMensaje(''); setPantalla('clientes') }, 700)
  }

  function imprimirComprobanteTrabajo() {
    if (!trabajoSeleccionado) return
    const cliente = vehiculoSeleccionado?.customers || clienteSeleccionado
    const numero = `EC-${String(trabajoSeleccionado.id).slice(0, 8).toUpperCase()}`
    const total = Number(trabajoSeleccionado.importe || 0)
    const partes = trabajoPartes || []
    const ventana = window.open('', '_blank', 'width=800,height=900')
    if (!ventana) return
    ventana.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Comprobante ${numero}</title><style>body{font-family:Arial;max-width:760px;margin:auto;padding:35px;color:#222}.cab{display:flex;justify-content:space-between;border-bottom:2px solid #222;padding-bottom:18px}.fila{border-bottom:1px solid #ddd;padding:9px 0;display:flex;justify-content:space-between;gap:20px}.total{text-align:right;font-size:22px;font-weight:bold;margin-top:25px}.pie{text-align:center;color:#666;font-size:12px;margin-top:45px}</style></head><body><div class="cab"><div><h1>EL CHINO</h1><div>Taller Mecánico</div></div><div><strong>COMPROBANTE DE TRABAJO</strong><br>${numero}<br>${formatoFecha(trabajoSeleccionado.fecha)}</div></div><p><strong>Cliente:</strong> ${textoSeguro(cliente?.nombre)||'-'}</p><p><strong>Teléfono:</strong> ${textoSeguro(cliente?.telefono)||'-'}</p><p><strong>Vehículo:</strong> ${textoSeguro(vehiculoSeleccionado?.marca)} ${textoSeguro(vehiculoSeleccionado?.modelo)}</p><p><strong>Patente:</strong> ${textoSeguro(vehiculoSeleccionado?.patente)||'-'}</p><p><strong>Kilometraje:</strong> ${trabajoSeleccionado.kilometraje ? trabajoSeleccionado.kilometraje+' km':'-'}</p><h3>Trabajo realizado</h3><p>${textoSeguro(trabajoSeleccionado.descripcion)}</p>${trabajoSeleccionado.tipo_trabajo?`<p><strong>Tipo:</strong> ${textoSeguro(trabajoSeleccionado.tipo_trabajo)}</p>`:''}${trabajoSeleccionado.observaciones?`<p><strong>Observaciones:</strong> ${textoSeguro(trabajoSeleccionado.observaciones)}</p>`:''}${partes.length?`<h3>Repuestos</h3>${partes.map(x=>`<div class="fila"><div><strong>${textoSeguro(x.nombre)}</strong>${x.marca?' — '+textoSeguro(x.marca):''} × ${x.cantidad||1}</div><div>${formatoImporte(Number(x.precio||0)*Number(x.cantidad||1))}</div></div>`).join('')}`:''}<div class="fila"><div><strong>Mano de obra</strong></div><div>${formatoImporte(total)}</div></div><div class="total">TOTAL: ${formatoImporte(total + totalRepuestos(partes))}</div><div class="pie">Comprobante interno de trabajo de EL CHINO.<br>No constituye por sí mismo una factura electrónica fiscal.</div></body></html>`)
    ventana.document.close(); ventana.focus(); ventana.print()
  }

  function imprimirQR() {
    if (!vehiculoSeleccionado) return
    const canvas = document.querySelector('[data-qr-vehiculo] canvas')
    const dataUrl = canvas?.toDataURL('image/png')
    if (!dataUrl) { setError('No se pudo preparar el QR para imprimir.'); return }
    const ventana = window.open('', '_blank', 'width=700,height=800')
    if (!ventana) return
    ventana.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>QR - ${vehiculoSeleccionado.patente}</title><style>body{font-family:Arial;text-align:center;padding:40px}img{width:350px;height:350px}</style></head><body><h1>EL CHINO</h1><h2>Historial del vehículo</h2><h3>${vehiculoSeleccionado.marca} ${vehiculoSeleccionado.modelo}</h3><h2>${vehiculoSeleccionado.patente}</h2><img src="${dataUrl}"><p>Escaneá el código para consultar el historial.</p></body></html>`)
    ventana.document.close(); ventana.focus(); ventana.print()
  }

  async function copiarEnlacePublico() {
    if (!vehiculoSeleccionado) return
    const url = urlPublicaVehiculo(vehiculoSeleccionado)
    try { await navigator.clipboard.writeText(url); setMensaje('Enlace público copiado.'); setTimeout(()=>setMensaje(''),1500) }
    catch { window.prompt('Copiá este enlace:', url) }
  }

  function imprimirHistorial() {
    if (!vehiculoSeleccionado) return

    const trabajosParaImprimir =
      trabajosVehiculo

    const contenido =
      trabajosParaImprimir.length === 0
        ? '<p>No hay trabajos registrados.</p>'
        : trabajosParaImprimir
            .map(
              (trabajo) => `
                <div class="trabajo">
                  <h3>
                    ${formatoFecha(
                      trabajo.fecha
                    )}
                    ${
                      trabajo.tipo_trabajo
                        ? ` — ${trabajo.tipo_trabajo}`
                        : ''
                    }
                  </h3>

                  <p>
                    <strong>Kilometraje:</strong>
                    ${
                      trabajo.kilometraje
                        ? `${trabajo.kilometraje} km`
                        : '-'
                    }
                  </p>

                  <p>
                    <strong>Trabajo realizado:</strong><br>
                    ${textoSeguro(
                      trabajo.descripcion
                    )}
                  </p>

                  ${
                    trabajo.observaciones
                      ? `
                        <p>
                          <strong>Observaciones:</strong><br>
                          ${trabajo.observaciones}
                        </p>
                      `
                      : ''
                  }

                  ${
                    trabajo.importe != null
                      ? `
                        <p>
                          <strong>Importe:</strong>
                          ${formatoImporte(
                            trabajo.importe
                          )}
                        </p>
                      `
                      : ''
                  }
                </div>
              `
            )
            .join('')

    const ventana =
      window.open(
        '',
        '_blank',
        'width=900,height=700'
      )

    if (!ventana) return

    ventana.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Historial - ${
          vehiculoSeleccionado.patente
        }</title>

        <style>
          body {
            font-family: Arial, sans-serif;
            padding: 40px;
            color: #222;
          }

          h1 {
            margin-bottom: 5px;
          }

          h2 {
            margin-top: 0;
            color: #555;
          }

          .cabecera {
            border-bottom: 2px solid #222;
            padding-bottom: 20px;
            margin-bottom: 25px;
          }

          .trabajo {
            border: 1px solid #ddd;
            padding: 18px;
            margin-bottom: 15px;
            border-radius: 8px;
          }

          .trabajo h3 {
            margin-top: 0;
          }

          .pie {
            margin-top: 30px;
            font-size: 12px;
            color: #777;
          }
        </style>
      </head>

      <body>

        <div class="cabecera">
          <h1>EL CHINO</h1>
          <h2>Historial del vehículo</h2>

          <p>
            <strong>Vehículo:</strong>
            ${
              vehiculoSeleccionado.marca
            }
            ${
              vehiculoSeleccionado.modelo
            }
          </p>

          <p>
            <strong>Patente:</strong>
            ${
              vehiculoSeleccionado.patente
            }
          </p>

          <p>
            <strong>Kilometraje actual:</strong>
            ${
              vehiculoSeleccionado.kilometraje ||
              '-'
            } km
          </p>
        </div>

        ${contenido}

        <div class="pie">
          Historial generado por EL CHINO — Taller Mecánico
        </div>

      </body>
      </html>
    `)

    ventana.document.close()
    ventana.focus()
    ventana.print()
  }

  if (pantalla === 'publico') {
    return (
      <div className="app">

        <main className="main">

          {cargando && (
            <section className="panel">
              <h2>Cargando historial...</h2>
            </section>
          )}

          {!cargando && error && (
            <section className="panel">
              <h2>No se pudo cargar</h2>

              <div className="error-message">
                {error}
              </div>
            </section>
          )}

          {!cargando &&
            !error &&
            vehiculoPublico && (
              <section className="panel">

                <div className="welcome">
                  <h1>EL CHINO</h1>

                  <h2>
                    Historial del vehículo
                  </h2>

                  <p>
                    Historial de mantenimiento
                    y trabajos realizados.
                  </p>
                </div>

                <div className="vehicle-header">

                  <div>
                    <span className="vehicle-label">
                      VEHÍCULO
                    </span>

                    <h2>
                      {
                        vehiculoPublico.patente
                      }
                    </h2>

                    <p>
                      {
                        vehiculoPublico.marca
                      }{' '}
                      {
                        vehiculoPublico.modelo
                      }
                    </p>
                  </div>

                </div>

                <div className="vehicle-detail-grid">

                  <div className="detail-item">
                    <span>Patente</span>

                    <strong>
                      {
                        vehiculoPublico.patente
                      }
                    </strong>
                  </div>

                  <div className="detail-item">
                    <span>Marca</span>

                    <strong>
                      {
                        vehiculoPublico.marca
                      }
                    </strong>
                  </div>

                  <div className="detail-item">
                    <span>Modelo</span>

                    <strong>
                      {
                        vehiculoPublico.modelo
                      }
                    </strong>
                  </div>

                  <div className="detail-item">
                    <span>Año</span>

                    <strong>
                      {
                        vehiculoPublico.anio ||
                        '-'
                      }
                    </strong>
                  </div>

                  <div className="detail-item">
                    <span>Kilometraje actual</span>

                    <strong>
                      {
                        vehiculoPublico.kilometraje ||
                        '-'
                      }{' '}
                      km
                    </strong>
                  </div>

                </div>

                {obtenerMantenimiento(vehiculoPublico) && (() => {
                  const mantenimiento = obtenerMantenimiento(vehiculoPublico)
                  return (
                    <div className="panel" style={{ marginTop:'15px' }}>
                      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:'12px', flexWrap:'wrap' }}>
                        <div><span className="vehicle-label">MANTENIMIENTO</span><h3>{mantenimiento.tipo}</h3></div>
                        <strong>{textoEstadoMantenimiento(mantenimiento, vehiculoPublico.kilometraje)}</strong>
                      </div>
                      <div className="vehicle-detail-grid">
                        <div className="detail-item"><span>Último service</span><strong>{formatoFecha(mantenimiento.fechaUltimo)}</strong></div>
                        <div className="detail-item"><span>Km realizado</span><strong>{mantenimiento.kmUltimo ? `${Number(mantenimiento.kmUltimo).toLocaleString('es-AR')} km` : '-'}</strong></div>
                        <div className="detail-item"><span>Próxima fecha</span><strong>{mantenimiento.fechaProxima ? formatoFecha(mantenimiento.fechaProxima) : '-'}</strong></div>
                        <div className="detail-item"><span>Próximo km</span><strong>{mantenimiento.kmProximo ? `${Number(mantenimiento.kmProximo).toLocaleString('es-AR')} km` : '-'}</strong></div>
                      </div>
                      {mantenimiento.notas && <p>{mantenimiento.notas}</p>}
                    </div>
                  )
                })()}

                <div className="panel">

                  <h3>
                    Historial de servicios
                  </h3>

                  {trabajosPublicos.length ===
                    0 && (
                    <div className="empty">
                      Todavía no hay trabajos
                      registrados para este
                      vehículo.
                    </div>
                  )}

                  {trabajosPublicos.map(
                    (trabajo) => {

                      const partes =
                        partesPublicos.filter(
                          (parte) =>
                            parte.service_record_id ===
                            trabajo.id
                        )

                      return (
                        <div
                          key={trabajo.id}
                          className="vehicle-card"
                          style={{
                            display: 'block',
                            marginBottom:
                              '14px',
                            cursor:
                              'default',
                          }}
                        >

                          <div
                            style={{
                              display:
                                'flex',
                              justifyContent:
                                'space-between',
                              gap: '20px',
                              flexWrap:
                                'wrap',
                            }}
                          >

                            <div>

                              <strong>
                                {
                                  formatoFecha(
                                    trabajo.fecha
                                  )
                                }
                              </strong>

                              <p>
                                {
                                  trabajo.tipo_trabajo ||
                                  'Trabajo realizado'
                                }
                              </p>

                            </div>

                            <div>
                              <strong>
                                {
                                  trabajo.kilometraje
                                    ? `${trabajo.kilometraje} km`
                                    : ''
                                }
                              </strong>
                            </div>

                          </div>

                          <p>
                            {
                              trabajo.descripcion
                            }
                          </p>

                          {trabajo.observaciones && (
                            <p>
                              <strong>
                                Observaciones:
                              </strong>{' '}
                              {
                                trabajo.observaciones
                              }
                            </p>
                          )}

                          {partes.length > 0 && (
                            <div>

                              <strong>
                                Repuestos:
                              </strong>

                              <ul>
                                {partes.map(
                                  (parte) => (
                                    <li
                                      key={
                                        parte.id
                                      }
                                    >
                                      {
                                        parte.nombre
                                      }

                                      {parte.marca
                                        ? ` — ${parte.marca}`
                                        : ''}

                                      {parte.cantidad
                                        ? ` — Cant.: ${parte.cantidad}`
                                        : ''}
                                    </li>
                                  )
                                )}
                              </ul>

                            </div>
                          )}

                          {fotosPublicas.filter((foto) => foto.service_record_id === trabajo.id).length > 0 && (
                            <div style={{ marginTop:'12px' }}>
                              <strong>Fotos:</strong>
                              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(120px,1fr))', gap:'8px', marginTop:'8px' }}>
                                {fotosPublicas.filter((foto) => foto.service_record_id === trabajo.id).map((foto) => (
                                  <a key={foto.id} href={foto.foto_url} target="_blank" rel="noreferrer">
                                    <img src={foto.foto_url} alt="Foto del trabajo" style={{ width:'100%', height:'110px', objectFit:'cover', borderRadius:'8px' }} />
                                  </a>
                                ))}
                              </div>
                            </div>
                          )}

                        </div>
                      )
                    }
                  )}

                </div>

                <div
                  className="success-message"
                  style={{
                    textAlign:
                      'center',
                  }}
                >
                  Historial actualizado por
                  EL CHINO
                </div>

              </section>
            )}

        </main>

      </div>
    )
  }

  return (
    <div className="app">

      <header className="header">

        <div>
          <h1>EL CHINO</h1>
          <p>Taller Mecánico</p>
        </div>

        <div className="header-status">
          Sistema de gestión
        </div>

      </header>

      <nav
        style={{
          display: 'flex',
          gap: '8px',
          padding: '12px 20px',
          flexWrap: 'wrap',
        }}
      >

        <button
          className="action-button"
          onClick={irInicio}
        >
          <Home size={17} />
          Inicio
        </button>

        <button
          className="action-button"
          onClick={irVehiculos}
        >
          <CarFront size={17} />
          Vehículos
        </button>

        <button
          className="action-button"
          onClick={irClientes}
        >
          <Users size={17} />
          Clientes
        </button>

        <button
          className="action-button"
          onClick={() => { limpiarMensajes(); setPantalla('presupuestos') }}
        >
          <FileText size={17} />
          Presupuestos
        </button>

      </nav>

      <main className="main">

        {error && (
          <div className="error-message">
            {error}
          </div>
        )}

        {mensaje && (
          <div className="success-message">
            {mensaje}
          </div>
        )}

        {/* INICIO */}

        {pantalla === 'inicio' && (
          <>

            <section className="welcome">

              <h2>
                Gestión del Taller
              </h2>

              <p>
                Administrá clientes,
                vehículos, trabajos,
                repuestos e historial
                de servicio.
              </p>

            </section>

            <section className="cards">

              <button
                className="card"
                onClick={nuevoCliente}
              >

                <span className="card-icon">
                  <UserPlus />
                </span>

                <strong>
                  Nuevo cliente + vehículo
                </strong>

                <span>
                  Registrar un cliente y su
                  primer vehículo
                </span>

              </button>

              <button
                className="card"
                onClick={irVehiculos}
              >

                <span className="card-icon">
                  <CarFront />
                </span>

                <strong>
                  Vehículos
                </strong>

                <span>
                  Buscar vehículos e
                  historial
                </span>

              </button>

              <button
                className="card"
                onClick={irClientes}
              >

                <span className="card-icon">
                  <Users />
                </span>

                <strong>
                  Clientes
                </strong>

                <span>
                  Administrar clientes y
                  sus vehículos
                </span>

              </button>

              <button
                className="card"
                onClick={() => { limpiarMensajes(); setPantalla('presupuestos') }}
              >
                <span className="card-icon">
                  <FileText />
                </span>
                <strong>Presupuestos</strong>
                <span>
                  Preparar, imprimir y compartir presupuestos
                </span>
              </button>

            </section>

          </>
        )}

        {/* VEHICULOS */}

        {pantalla === 'vehiculos' && (
          <section className="panel">

            <button
              className="back"
              onClick={irInicio}
            >
              <ArrowLeft size={17} />
              Volver
            </button>

            <div
              style={{
                display: 'flex',
                justifyContent:
                  'space-between',
                alignItems: 'center',
                gap: '15px',
                flexWrap: 'wrap',
              }}
            >

              <div>
                <h2>
                  Vehículos
                </h2>

                <p>
                  Buscá cualquier vehículo
                  del taller.
                </p>
              </div>

              <button
                className="save-button"
                type="button"
                onClick={nuevoCliente}
              >
                <UserPlus size={18} />
                Nuevo cliente + vehículo
              </button>

            </div>

            <div className="search-box">

              <Search size={19} />

              <input
                type="text"
                value={
                  busquedaVehiculo
                }
                onChange={(e) =>
                  setBusquedaVehiculo(
                    e.target.value
                  )
                }
                placeholder="Buscar por patente, marca, modelo, VIN o cliente..."
              />

            </div>

            {cargando && (
              <div className="empty">
                Cargando...
              </div>
            )}

            {!cargando &&
              vehiculosFiltrados.length ===
                0 && (
                <div className="empty">
                  No se encontraron
                  vehículos.
                </div>
              )}

            <div className="vehicle-list">

              {vehiculosFiltrados.map(
                (vehiculo) => {

                  const cliente =
                    vehiculo.customers ||
                    clientes.find(
                      (item) =>
                        item.id ===
                        vehiculo.customer_id
                    )

                  return (
                    <button
                      className="vehicle-card"
                      key={vehiculo.id}
                      onClick={() =>
                        abrirVehiculo(
                          vehiculo
                        )
                      }
                    >

                      <div>

                        <strong>
                          {
                            vehiculo.patente
                          }
                        </strong>

                        <p>
                          {
                            vehiculo.marca
                          }{' '}
                          {
                            vehiculo.modelo
                          }
                        </p>

                        {cliente && (
                          <small>
                            <UserRound
                              size={14}
                            />{' '}
                            {
                              cliente.nombre
                            }
                          </small>
                        )}

                      </div>

                      <div className="vehicle-data">

                        <span>
                          Año:{' '}
                          {
                            vehiculo.anio ||
                            '-'
                          }
                        </span>

                        <span>
                          Km:{' '}
                          {
                            vehiculo.kilometraje ||
                            '-'
                          }
                        </span>

                      </div>

                      <ChevronRight
                        className="vehicle-arrow"
                        size={22}
                      />

                    </button>
                  )
                }
              )}

            </div>

          </section>
        )}

        {/* FICHA VEHICULO */}

        {pantalla === 'ficha' &&
          vehiculoSeleccionado && (
            <section className="panel">

              <button
                className="back"
                onClick={irVehiculos}
              >
                <ArrowLeft size={17} />
                Volver a vehículos
              </button>

              <div className="vehicle-header">

                <div>

                  <span className="vehicle-label">
                    VEHÍCULO
                  </span>

                  <h2>
                    {
                      vehiculoSeleccionado.patente
                    }
                  </h2>

                  <p>
                    {
                      vehiculoSeleccionado.marca
                    }{' '}
                    {
                      vehiculoSeleccionado.modelo
                    }
                  </p>

                </div>

              </div>

              {vehiculoSeleccionado.foto_url && (
                <div style={{ textAlign:'center', margin:'15px 0' }}>
                  <img src={vehiculoSeleccionado.foto_url} alt="Vehículo" style={{maxWidth:'100%',maxHeight:'280px',borderRadius:'12px',objectFit:'cover'}} />
                </div>
              )}

              {clienteSeleccionado && (
                <div className="panel">

                  <div
                    style={{
                      display:
                        'flex',
                      justifyContent:
                        'space-between',
                      gap: '15px',
                      flexWrap:
                        'wrap',
                    }}
                  >

                    <div>

                      <span className="vehicle-label">
                        CLIENTE
                      </span>

                      <h3>
                        {
                          clienteSeleccionado.nombre
                        }
                      </h3>

                      <p>
                        {
                          clienteSeleccionado.telefono ||
                          'Sin teléfono'
                        }
                      </p>

                    </div>

                    <button
                      className="action-button"
                      onClick={() =>
                        abrirCliente(
                          clienteSeleccionado
                        )
                      }
                    >
                      Ver cliente
                    </button>

                  </div>

                </div>
              )}

              <div className="vehicle-detail-grid">

                <div className="detail-item">
                  <span>Patente</span>
                  <strong>
                    {
                      vehiculoSeleccionado.patente ||
                      '-'
                    }
                  </strong>
                </div>

                <div className="detail-item">
                  <span>Marca</span>
                  <strong>
                    {
                      vehiculoSeleccionado.marca ||
                      '-'
                    }
                  </strong>
                </div>

                <div className="detail-item">
                  <span>Modelo</span>
                  <strong>
                    {
                      vehiculoSeleccionado.modelo ||
                      '-'
                    }
                  </strong>
                </div>

                <div className="detail-item">
                  <span>Año</span>
                  <strong>
                    {
                      vehiculoSeleccionado.anio ||
                      '-'
                    }
                  </strong>
                </div>

                <div className="detail-item">
                  <span>VIN</span>
                  <strong>
                    {
                      vehiculoSeleccionado.vin ||
                      '-'
                    }
                  </strong>
                </div>

                <div className="detail-item">
                  <span>Kilometraje actual</span>
                  <strong>
                    {
                      vehiculoSeleccionado.kilometraje ||
                      '-'
                    }{' '}
                    km
                  </strong>
                </div>

              </div>

              {(() => {
                const mantenimiento = obtenerMantenimiento(vehiculoSeleccionado)
                return mantenimiento ? (
                  <div className="panel" style={{ marginTop:'15px' }}>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:'15px', flexWrap:'wrap' }}>
                      <div><span className="vehicle-label">MANTENIMIENTO</span><h3>{mantenimiento.tipo}</h3><p>{textoEstadoMantenimiento(mantenimiento, vehiculoSeleccionado.kilometraje)}</p></div>
                      <button className="action-button" onClick={abrirMantenimiento}>Editar próximo service</button>
                    </div>
                    <div className="vehicle-detail-grid">
                      <div className="detail-item"><span>Último service</span><strong>{formatoFecha(mantenimiento.fechaUltimo)}</strong></div>
                      <div className="detail-item"><span>Km realizado</span><strong>{mantenimiento.kmUltimo ? `${Number(mantenimiento.kmUltimo).toLocaleString('es-AR')} km` : '-'}</strong></div>
                      <div className="detail-item"><span>Próxima fecha</span><strong>{mantenimiento.fechaProxima ? formatoFecha(mantenimiento.fechaProxima) : '-'}</strong></div>
                      <div className="detail-item"><span>Próximo km</span><strong>{mantenimiento.kmProximo ? `${Number(mantenimiento.kmProximo).toLocaleString('es-AR')} km` : '-'}</strong></div>
                    </div>
                    {mantenimiento.notas && <p><strong>Notas:</strong> {mantenimiento.notas}</p>}
                  </div>
                ) : (
                  <div className="panel" style={{ marginTop:'15px' }}>
                    <span className="vehicle-label">MANTENIMIENTO</span><h3>Programar próximo service</h3>
                    <p>Registrá cambio de aceite, filtros, distribución, frenos u otro mantenimiento y definí cuándo corresponde volver.</p>
                    <button className="action-button" onClick={abrirMantenimiento}><CalendarDays size={17} /> Programar mantenimiento</button>
                  </div>
                )
              })()}

              {presupuestosVehiculo.length > 0 && (
                <div className="panel">
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:'15px', flexWrap:'wrap' }}>
                    <div>
                      <h3>Presupuestos pendientes</h3>
                      <p>{presupuestosVehiculo.length} presupuesto(s) guardado(s) para este vehículo.</p>
                    </div>
                    <button className="action-button" onClick={() => setPantalla('presupuestos')}>
                      Ver presupuestos
                    </button>
                  </div>
                </div>
              )}

              <div className="vehicle-actions">

                <button
                  className="action-button"
                  onClick={nuevoTrabajo}
                >
                  <Wrench size={18} />
                  Nuevo trabajo
                </button>

                <button
                  className="action-button"
                  onClick={nuevoPresupuesto}
                >
                  <FileText size={18} />
                  Nuevo presupuesto
                </button>

                <button
                  className="action-button"
                  onClick={abrirHistorial}
                >
                  <History size={18} />
                  Ver historial
                </button>

                <button
                  className="action-button"
                  onClick={editarVehiculo}
                >
                  <Pencil size={18} />
                  Editar vehículo
                </button>

                <button
                  className="action-button"
                  onClick={abrirQR}
                >
                  <QrCode size={18} />
                  Ver QR
                </button>

                <button
                  className="action-button"
                  onClick={imprimirHistorial}
                >
                  <Printer size={18} />
                  Imprimir historial
                </button>


                <button className="action-button" onClick={eliminarVehiculo} disabled={guardando}>
                  <Trash2 size={18} />
                  Eliminar vehículo
                </button>
              </div>

              <div className="panel">

                <div
                  style={{
                    display:
                      'flex',
                    justifyContent:
                      'space-between',
                    alignItems:
                      'center',
                    gap: '15px',
                  }}
                >

                  <div>

                    <h3>
                      Últimos trabajos
                    </h3>

                    <p>
                      Historial del vehículo
                    </p>

                  </div>

                  <strong>
                    {
                      formatoImporte(
                        totalHistoricoVehiculo
                      )
                    }
                  </strong>

                </div>

                {trabajosVehiculo.length ===
                  0 && (
                  <div className="empty">
                    Todavía no hay trabajos
                    registrados.
                  </div>
                )}

                {trabajosVehiculo
                  .slice(0, 5)
                  .map((trabajo) => (
                    <button
                      key={trabajo.id}
                      className="vehicle-card"
                      onClick={() =>
                        abrirTrabajo(
                          trabajo
                        )
                      }
                      style={{
                        marginBottom:
                          '10px',
                      }}
                    >

                      <div>

                        <strong>
                          {
                            formatoFecha(
                              trabajo.fecha
                            )
                          }
                        </strong>

                        <p>
                          {
                            trabajo.tipo_trabajo ||
                            'Trabajo'
                          }
                        </p>

                      </div>

                      <div>

                        <strong>
                          {
                            formatoImporte(
                              trabajo.importe
                            )
                          }
                        </strong>

                        <p>
                          {
                            trabajo.kilometraje
                              ? `${trabajo.kilometraje} km`
                              : ''
                          }
                        </p>

                      </div>

                      <ChevronRight
                        size={20}
                      />

                    </button>
                  ))}

                {trabajosVehiculo.length >
                  5 && (
                  <button
                    className="action-button"
                    onClick={
                      abrirHistorial
                    }
                  >
                    Ver historial completo
                  </button>
                )}

              </div>

            </section>
          )}

        {/* NUEVO CLIENTE + VEHICULO */}

        {pantalla === 'nuevoCliente' && (
          <section className="panel">

            <button
              className="back"
              onClick={irClientes}
            >
              <ArrowLeft size={17} />
              Volver a clientes
            </button>

            <h2>
              Nuevo cliente + vehículo
            </h2>

            <p>
              Registrá al cliente y su
              primer vehículo en un solo
              paso.
            </p>

            <form
              className="vehicle-form"
              onSubmit={guardarCliente}
            >

              <h3>
                Datos del cliente
              </h3>

              <div className="form-grid">

                <div className="form-field">
                  <label>
                    Nombre *
                  </label>

                  <input
                    type="text"
                    name="nombre"
                    value={
                      formCliente.nombre
                    }
                    onChange={
                      cambiarCliente
                    }
                    required
                  />
                </div>

                <div className="form-field">
                  <label>
                    Teléfono
                  </label>

                  <input
                    type="text"
                    name="telefono"
                    value={
                      formCliente.telefono
                    }
                    onChange={
                      cambiarCliente
                    }
                  />
                </div>

                <div className="form-field">
                  <label>
                    Email
                  </label>

                  <input
                    type="email"
                    name="email"
                    value={
                      formCliente.email
                    }
                    onChange={
                      cambiarCliente
                    }
                  />
                </div>

                <div className="form-field">
                  <label>
                    Dirección
                  </label>

                  <input
                    type="text"
                    name="direccion"
                    value={
                      formCliente.direccion
                    }
                    onChange={
                      cambiarCliente
                    }
                  />
                </div>

              </div>

              <div className="form-field">

                <label>
                  Observaciones del cliente
                </label>

                <textarea
                  name="observaciones"
                  value={
                    formCliente.observaciones
                  }
                  onChange={
                    cambiarCliente
                  }
                  rows="3"
                />

              </div>

              <hr />

              <h3>
                Primer vehículo
              </h3>

              <p>
                Este vehículo quedará
                automáticamente asociado al
                cliente.
              </p>

              <div className="form-grid">

                <div className="form-field">
                  <label>
                    Patente *
                  </label>

                  <input
                    type="text"
                    name="vehiculo_patente"
                    value={
                      formCliente.vehiculo_patente
                    }
                    onChange={
                      cambiarCliente
                    }
                    placeholder="Ej: AB123CD"
                    required
                  />
                </div>

                <div className="form-field">
                  <label>
                    Marca *
                  </label>

                  <input
                    type="text"
                    name="vehiculo_marca"
                    value={
                      formCliente.vehiculo_marca
                    }
                    onChange={
                      cambiarCliente
                    }
                    placeholder="Ej: Peugeot"
                    required
                  />
                </div>

                <div className="form-field">
                  <label>
                    Modelo *
                  </label>

                  <input
                    type="text"
                    name="vehiculo_modelo"
                    value={
                      formCliente.vehiculo_modelo
                    }
                    onChange={
                      cambiarCliente
                    }
                    placeholder="Ej: 207"
                    required
                  />
                </div>

                <div className="form-field">
                  <label>
                    Año
                  </label>

                  <input
                    type="number"
                    name="vehiculo_anio"
                    value={
                      formCliente.vehiculo_anio
                    }
                    onChange={
                      cambiarCliente
                    }
                    placeholder="Ej: 2010"
                  />
                </div>

                <div className="form-field">
                  <label>
                    Kilometraje
                  </label>

                  <input
                    type="number"
                    name="vehiculo_kilometraje"
                    value={
                      formCliente.vehiculo_kilometraje
                    }
                    onChange={
                      cambiarCliente
                    }
                    placeholder="Ej: 150000"
                  />
                </div>

                <div className="form-field">
                  <label>
                    VIN / Chasis
                  </label>

                  <input
                    type="text"
                    name="vehiculo_vin"
                    value={
                      formCliente.vehiculo_vin
                    }
                    onChange={
                      cambiarCliente
                    }
                  />
                </div>

                <div className="form-field">
                  <label>Foto del vehículo</label>
                  <input type="file" accept="image/*" onChange={cambiarFotoVehiculo} />
                  {formVehiculo.foto_url && <img src={formVehiculo.foto_url} alt="Vehículo" style={{width:'140px',height:'90px',objectFit:'cover',borderRadius:'10px',marginTop:'8px'}} />}
                  {fotoVehiculo && <small>Foto seleccionada: {fotoVehiculo.name}</small>}
                </div>

              </div>

              <div className="form-field">

                <label>
                  Observaciones del vehículo
                </label>

                <textarea
                  name="vehiculo_observaciones"
                  value={
                    formCliente.vehiculo_observaciones
                  }
                  onChange={
                    cambiarCliente
                  }
                  rows="3"
                />

              </div>

              <button
                className="save-button"
                type="submit"
                disabled={guardando}
              >

                <Save size={18} />

                {guardando
                  ? 'Guardando...'
                  : 'Guardar cliente y vehículo'}

              </button>

            </form>

          </section>
        )}

        {/* NUEVO VEHICULO PARA CLIENTE */}

        {pantalla === 'nuevo' && (
          <section className="panel">

            <button
              className="back"
              onClick={() =>
                clienteSeleccionado
                  ? setPantalla(
                      'clienteDetalle'
                    )
                  : irVehiculos()
              }
            >
              <ArrowLeft size={17} />
              Volver
            </button>

            <h2>
              {formVehiculo.cliente_id
                ? 'Agregar vehículo'
                : 'Nuevo vehículo'}
            </h2>

            {clienteSeleccionado && (
              <p>
                Cliente:{' '}
                <strong>
                  {
                    clienteSeleccionado.nombre
                  }
                </strong>
              </p>
            )}

            <form
              className="vehicle-form"
              onSubmit={guardarVehiculo}
            >

              <div className="form-grid">

                <div className="form-field">
                  <label>
                    Patente *
                  </label>

                  <input
                    type="text"
                    name="patente"
                    value={
                      formVehiculo.patente
                    }
                    onChange={
                      cambiarVehiculo
                    }
                    required
                  />
                </div>

                <div className="form-field">
                  <label>
                    Marca *
                  </label>

                  <input
                    type="text"
                    name="marca"
                    value={
                      formVehiculo.marca
                    }
                    onChange={
                      cambiarVehiculo
                    }
                    required
                  />
                </div>

                <div className="form-field">
                  <label>
                    Modelo *
                  </label>

                  <input
                    type="text"
                    name="modelo"
                    value={
                      formVehiculo.modelo
                    }
                    onChange={
                      cambiarVehiculo
                    }
                    required
                  />
                </div>

                <div className="form-field">
                  <label>
                    Año
                  </label>

                  <input
                    type="number"
                    name="anio"
                    value={
                      formVehiculo.anio
                    }
                    onChange={
                      cambiarVehiculo
                    }
                  />
                </div>

                <div className="form-field">
                  <label>
                    Kilometraje
                  </label>

                  <input
                    type="number"
                    name="kilometraje"
                    value={
                      formVehiculo.kilometraje
                    }
                    onChange={
                      cambiarVehiculo
                    }
                  />
                </div>

                <div className="form-field">
                  <label>
                    VIN / Chasis
                  </label>

                  <input
                    type="text"
                    name="vin"
                    value={
                      formVehiculo.vin
                    }
                    onChange={
                      cambiarVehiculo
                    }
                  />
                </div>

                <div className="form-field">
                  <label>Foto del vehículo</label>
                  <input type="file" accept="image/*" onChange={cambiarFotoVehiculo} />
                  {formVehiculo.foto_url && <img src={formVehiculo.foto_url} alt="Vehículo" style={{width:'140px',height:'90px',objectFit:'cover',borderRadius:'10px',marginTop:'8px'}} />}
                  {fotoVehiculo && <small>Foto seleccionada: {fotoVehiculo.name}</small>}
                </div>

              </div>

              {!formVehiculo.cliente_id && (
                <div className="form-field">

                  <label>
                    Cliente
                  </label>

                  <select
                    name="cliente_id"
                    value={
                      formVehiculo.cliente_id
                    }
                    onChange={
                      cambiarVehiculo
                    }
                  >

                    <option value="">
                      Sin cliente
                    </option>

                    {clientes.map(
                      (cliente) => (
                        <option
                          key={cliente.id}
                          value={
                            cliente.id
                          }
                        >
                          {
                            cliente.nombre
                          }
                        </option>
                      )
                    )}

                  </select>

                </div>
              )}

              <div className="form-field">

                <label>
                  Observaciones
                </label>

                <textarea
                  name="observaciones"
                  value={
                    formVehiculo.observaciones
                  }
                  onChange={
                    cambiarVehiculo
                  }
                  rows="3"
                />

              </div>

              <button
                className="save-button"
                type="submit"
                disabled={guardando}
              >

                <Save size={18} />

                {guardando
                  ? 'Guardando...'
                  : 'Guardar vehículo'}

              </button>

            </form>

          </section>
        )}

        {/* EDITAR VEHICULO */}

        {pantalla ===
          'editarVehiculo' && (
          <section className="panel">

            <button
              className="back"
              onClick={() =>
                setPantalla('ficha')
              }
            >
              <ArrowLeft size={17} />
              Volver al vehículo
            </button>

            <h2>
              Editar vehículo
            </h2>

            <form
              className="vehicle-form"
              onSubmit={
                actualizarVehiculo
              }
            >

              <div className="form-grid">

                <div className="form-field">
                  <label>
                    Patente *
                  </label>

                  <input
                    name="patente"
                    value={
                      formVehiculo.patente
                    }
                    onChange={
                      cambiarVehiculo
                    }
                    required
                  />
                </div>

                <div className="form-field">
                  <label>
                    Marca *
                  </label>

                  <input
                    name="marca"
                    value={
                      formVehiculo.marca
                    }
                    onChange={
                      cambiarVehiculo
                    }
                    required
                  />
                </div>

                <div className="form-field">
                  <label>
                    Modelo *
                  </label>

                  <input
                    name="modelo"
                    value={
                      formVehiculo.modelo
                    }
                    onChange={
                      cambiarVehiculo
                    }
                    required
                  />
                </div>

                <div className="form-field">
                  <label>
                    Año
                  </label>

                  <input
                    type="number"
                    name="anio"
                    value={
                      formVehiculo.anio
                    }
                    onChange={
                      cambiarVehiculo
                    }
                  />
                </div>

                <div className="form-field">
                  <label>
                    Kilometraje
                  </label>

                  <input
                    type="number"
                    name="kilometraje"
                    value={
                      formVehiculo.kilometraje
                    }
                    onChange={
                      cambiarVehiculo
                    }
                  />
                </div>

                <div className="form-field">
                  <label>
                    VIN / Chasis
                  </label>

                  <input
                    name="vin"
                    value={
                      formVehiculo.vin
                    }
                    onChange={
                      cambiarVehiculo
                    }
                  />
                </div>

              </div>

              <div className="form-field">

                <label>
                  Cliente
                </label>

                <select
                  name="cliente_id"
                  value={
                    formVehiculo.cliente_id
                  }
                  onChange={
                    cambiarVehiculo
                  }
                >

                  <option value="">
                    Sin cliente
                  </option>

                  {clientes.map(
                    (cliente) => (
                      <option
                        key={cliente.id}
                        value={cliente.id}
                      >
                        {
                          cliente.nombre
                        }
                      </option>
                    )
                  )}

                </select>

              </div>

              <div className="form-field">

                <label>
                  Observaciones
                </label>

                <textarea
                  name="observaciones"
                  value={
                    formVehiculo.observaciones
                  }
                  onChange={
                    cambiarVehiculo
                  }
                  rows="3"
                />

              </div>

              <button
                className="save-button"
                type="submit"
                disabled={guardando}
              >
                <Save size={18} />

                {guardando
                  ? 'Guardando...'
                  : 'Guardar cambios'}
              </button>

            </form>

          </section>
        )}

        {/* NUEVO TRABAJO */}

        {pantalla ===
          'nuevoTrabajo' &&
          vehiculoSeleccionado && (
            <section className="panel">

              <button
                className="back"
                onClick={() =>
                  setPantalla('ficha')
                }
              >
                <ArrowLeft size={17} />
                Volver al vehículo
              </button>

              <h2>
                Nuevo trabajo
              </h2>

              <p>
                {
                  vehiculoSeleccionado.patente
                }{' '}
                —{' '}
                {
                  vehiculoSeleccionado.marca
                }{' '}
                {
                  vehiculoSeleccionado.modelo
                }
              </p>

              <form
                className="vehicle-form"
                onSubmit={
                  guardarTrabajo
                }
              >

                <div className="form-grid">

                  <div className="form-field">
                    <label>
                      Fecha *
                    </label>

                    <input
                      type="date"
                      name="fecha"
                      value={
                        formTrabajo.fecha
                      }
                      onChange={
                        cambiarTrabajo
                      }
                      required
                    />
                  </div>

                  <div className="form-field">
                    <label>
                      Kilometraje
                    </label>

                    <input
                      type="number"
                      name="kilometraje"
                      value={
                        formTrabajo.kilometraje
                      }
                      onChange={
                        cambiarTrabajo
                      }
                      placeholder="Ej: 150000"
                    />
                  </div>

                  <div className="form-field">
                    <label>
                      Tipo de trabajo
                    </label>

                    <input
                      type="text"
                      name="tipo_trabajo"
                      value={
                        formTrabajo.tipo_trabajo
                      }
                      onChange={
                        cambiarTrabajo
                      }
                      placeholder="Ej: Distribución"
                    />
                  </div>

                  <div className="form-field">
                    <label>
                      Mano de obra
                    </label>

                    <input
                      type="number"
                      name="importe"
                      value={
                        formTrabajo.importe
                      }
                      onChange={
                        cambiarTrabajo
                      }
                      min="0"
                      step="0.01"
                      placeholder="Ej: 300000"
                    />
                  </div>

                  <div className="form-field">
                    <label>Importe total</label>
                    <input
                      type="text"
                      value={formatoImporte(Number(formTrabajo.importe || 0) + totalRepuestos(partesForm))}
                      readOnly
                    />
                  </div>

                </div>

                <div className="form-field">

                  <label>
                    Descripción del trabajo *
                  </label>

                  <textarea
                    name="descripcion"
                    value={
                      formTrabajo.descripcion
                    }
                    onChange={
                      cambiarTrabajo
                    }
                    placeholder="Ej: Cambio de distribución, bomba de agua y correa auxiliar."
                    rows="5"
                    required
                  />

                </div>

                <div className="form-field">

                  <label>
                    Observaciones
                  </label>

                  <textarea
                    name="observaciones"
                    value={
                      formTrabajo.observaciones
                    }
                    onChange={
                      cambiarTrabajo
                    }
                    placeholder="Ej: Se recomienda revisar nuevamente a los 20.000 km."
                    rows="3"
                  />

                </div>

                <div className="panel" style={{ marginTop:'15px' }}>
                  <h3>Próximo mantenimiento</h3>
                  <p>Si este trabajo corresponde a un mantenimiento, podés dejar programado cuándo debe volver el vehículo.</p>
                  <label style={{ display:'flex', alignItems:'center', gap:'8px', marginBottom:'15px' }}>
                    <input
                      type="checkbox"
                      name="programarMantenimiento"
                      checked={Boolean(formTrabajo.programarMantenimiento)}
                      onChange={(e) => setFormTrabajo({ ...formTrabajo, programarMantenimiento: e.target.checked })}
                    />
                    Programar próximo service
                  </label>
                  {formTrabajo.programarMantenimiento && (
                    <div className="form-grid">
                      <div className="form-field">
                        <label>Próximo kilometraje</label>
                        <input type="number" min="0" name="proximoKm" value={formTrabajo.proximoKm} onChange={cambiarTrabajo} placeholder="Ej: 160000" />
                      </div>
                      <div className="form-field">
                        <label>Próxima fecha</label>
                        <input type="date" name="proximaFecha" value={formTrabajo.proximaFecha} onChange={cambiarTrabajo} />
                      </div>
                    </div>
                  )}
                </div>

                <div className="form-field">
                  <label>Fotos del trabajo</label>
                  <input type="file" accept="image/*" multiple onChange={cambiarFotosTrabajo} />
                  {fotosTrabajoForm.length > 0 && (
                    <small>{fotosTrabajoForm.length} foto(s) seleccionada(s).</small>
                  )}
                </div>

                <hr />

                <div
                  style={{
                    display:
                      'flex',
                    justifyContent:
                      'space-between',
                    alignItems:
                      'center',
                    gap: '10px',
                  }}
                >

                  <div>

                    <h3>
                      Repuestos utilizados
                    </h3>

                    <p>
                      Agregá los repuestos
                      utilizados en este
                      trabajo.
                    </p>

                  </div>

                  <div style={{display:'flex',gap:'8px',flexWrap:'wrap',justifyContent:'flex-end'}}>
                    <button type="button" className="action-button" onClick={cargarKitLubricentro}>
                      Cargar kit lubricentro
                    </button>
                    <button
                      type="button"
                      className="action-button"
                      onClick={
                        agregarParte
                      }
                    >
                      <Plus size={17} />
                      Agregar repuesto
                    </button>
                  </div>

                </div>

                {partesForm.length ===
                  0 && (
                  <div className="empty">
                    No agregaste repuestos.
                  </div>
                )}

                {partesForm.map(
                  (parte, indice) => (
                    <div
                      className="panel"
                      key={indice}
                    >

                      <div
                        style={{
                          display:
                            'flex',
                          justifyContent:
                            'space-between',
                          alignItems:
                            'center',
                        }}
                      >

                        <h4>
                          Repuesto{' '}
                          {indice + 1}
                        </h4>

                        <button
                          type="button"
                          className="action-button"
                          onClick={() =>
                            eliminarParte(
                              indice
                            )
                          }
                        >
                          <X size={17} />
                        </button>

                      </div>

                      <div className="form-grid">

                        <div className="form-field">
                          <label>
                            Repuesto
                          </label>

                          <input
                            value={
                              parte.nombre
                            }
                            onChange={(e) =>
                              cambiarParte(
                                indice,
                                'nombre',
                                e.target.value
                              )
                            }
                            placeholder="Ej: Kit distribución"
                          />
                        </div>

                        <div className="form-field">
                          <label>
                            Marca
                          </label>

                          <input
                            value={
                              parte.marca
                            }
                            onChange={(e) =>
                              cambiarParte(
                                indice,
                                'marca',
                                e.target.value
                              )
                            }
                            placeholder="Ej: SKF"
                          />
                        </div>

                        <div className="form-field">
                          <label>
                            Cantidad
                          </label>

                          <input
                            type="number"
                            min="0.01"
                            step="0.01"
                            value={
                              parte.cantidad
                            }
                            onChange={(e) =>
                              cambiarParte(
                                indice,
                                'cantidad',
                                e.target.value
                              )
                            }
                          />
                        </div>

                        <div className="form-field">
                          <label>Precio unitario</label>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={parte.precio}
                            onChange={(e) =>
                              cambiarParte(indice, 'precio', e.target.value)
                            }
                            placeholder="$"
                          />
                        </div>

                        <div className="form-field">
                          <label>Total</label>
                          <input
                            type="text"
                            readOnly
                            value={formatoImporte(Number(parte.precio || 0) * Number(parte.cantidad || 1))}
                          />
                        </div>

                      </div>

                      <div className="form-field">

                        <label>
                          Observaciones
                        </label>

                        <input
                          value={
                            parte.observaciones
                          }
                          onChange={(e) =>
                            cambiarParte(
                              indice,
                              'observaciones',
                              e.target.value
                            )
                          }
                        />

                      </div>

                    </div>
                  )
                )}

                <button
                  className="save-button"
                  type="submit"
                  disabled={guardando}
                >

                  <Save size={18} />

                  {guardando
                    ? 'Guardando trabajo...'
                    : 'Guardar trabajo'}

                </button>

              </form>

            </section>
          )}

        {/* PRESUPUESTOS */}

        {pantalla === 'presupuestos' && (
          <section className="panel">
            <button className="back" onClick={irInicio}>
              <ArrowLeft size={17} />
              Volver al inicio
            </button>

            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:'15px',flexWrap:'wrap'}}>
              <div>
                <span className="vehicle-label">GESTIÓN</span>
                <h2>Presupuestos</h2>
                <p>Presupuestos pendientes guardados en el sistema.</p>
              </div>
              <strong>{presupuestos.length} pendiente(s)</strong>
            </div>

            {presupuestos.length === 0 && (
              <div className="empty">No hay presupuestos pendientes.</div>
            )}

            {presupuestos.map((presupuesto) => {
              const vehiculo = vehiculos.find((item) => item.id === presupuesto.vehicle_id)
              return (
                <button
                  key={presupuesto.id}
                  className="vehicle-card"
                  onClick={() => {
                    if (vehiculo) {
                      setVehiculoSeleccionado(vehiculo)
                      const cliente = clientes.find((item) => item.id === vehiculo.customer_id)
                      setClienteSeleccionado(cliente || vehiculo.customers || null)
                    }
                    abrirPresupuesto(presupuesto)
                  }}
                  style={{width:'100%',marginBottom:'12px'}}
                >
                  <div style={{textAlign:'left'}}>
                    <strong>{vehiculo ? `${vehiculo.marca} ${vehiculo.modelo}` : 'Vehículo'}</strong>
                    <p>{vehiculo?.patente || '-'} · {tipoPresupuesto(presupuesto)}</p>
                    <small>{formatoFecha(presupuesto.fecha)}{presupuesto.kilometraje ? ` · ${presupuesto.kilometraje} km` : ''}</small>
                  </div>
                  <div style={{textAlign:'right'}}>
                    <strong>{formatoImporte(Number(presupuesto.importe || 0))}</strong>
                    <p>Mano de obra</p>
                  </div>
                  <ChevronRight size={21} />
                </button>
              )
            })}
          </section>
        )}

        {/* NUEVO PRESUPUESTO */}

        {pantalla === 'nuevoPresupuesto' && vehiculoSeleccionado && (
          <section className="panel">
            <button className="back" onClick={() => setPantalla('ficha')}>
              <ArrowLeft size={17} />
              Volver al vehículo
            </button>

            <span className="vehicle-label">PRESUPUESTO</span>
            <h2>Nuevo presupuesto</h2>
            <p><strong>{vehiculoSeleccionado.patente}</strong> — {vehiculoSeleccionado.marca} {vehiculoSeleccionado.modelo}</p>

            <form className="vehicle-form" onSubmit={guardarPresupuesto}>
              <div className="form-grid">
                <div className="form-field">
                  <label>Fecha</label>
                  <input type="date" name="fecha" value={formTrabajo.fecha} onChange={cambiarTrabajo} required />
                </div>
                <div className="form-field">
                  <label>Kilometraje</label>
                  <input type="number" name="kilometraje" value={formTrabajo.kilometraje} onChange={cambiarTrabajo} placeholder="Ej: 150000" />
                </div>
                <div className="form-field">
                  <label>Tipo de trabajo</label>
                  <select name="tipo_trabajo" value={formTrabajo.tipo_trabajo} onChange={cambiarTrabajo}>
                    <option value="">General</option>
                    <option>Diagnóstico</option>
                    <option>Mecánica</option>
                    <option>Electricidad</option>
                    <option>Inyección</option>
                    <option>Aire acondicionado</option>
                    <option>Distribución</option>
                    <option>Frenos</option>
                    <option>Service</option>
                    <option>Cambio de aceite y filtros</option>
                    <option>Filtro de aire</option>
                    <option>Filtro de combustible</option>
                    <option>Otro</option>
                  </select>
                </div>
                <div className="form-field">
                  <label>Mano de obra</label>
                  <input type="number" min="0" step="0.01" name="importe" value={formTrabajo.importe} onChange={cambiarTrabajo} placeholder="Ej: 300000" />
                </div>
                <div className="form-field">
                  <label>Total presupuesto</label>
                  <input type="text" readOnly value={formatoImporte(Number(formTrabajo.importe || 0) + totalRepuestos(partesForm))} />
                </div>
              </div>

              <div className="form-field">
                <label>Descripción del trabajo *</label>
                <textarea name="descripcion" value={formTrabajo.descripcion} onChange={cambiarTrabajo} placeholder="Ej: Cambio de distribución, bomba de agua y correa auxiliar." rows="5" required />
              </div>

              <div className="form-field">
                <label>Observaciones / condiciones</label>
                <textarea name="observaciones" value={formTrabajo.observaciones} onChange={cambiarTrabajo} placeholder="Ej: El precio queda sujeto a desmontaje y confirmación." rows="3" />
              </div>

              <hr />

              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:'10px',flexWrap:'wrap'}}>
                <div>
                  <h3>Repuestos</h3>
                  <p>Agregá cada repuesto con su precio unitario.</p>
                </div>
                <div style={{display:'flex',gap:'8px',flexWrap:'wrap',justifyContent:'flex-end'}}>
                  <button type="button" className="action-button" onClick={cargarKitLubricentro}>
                    Cargar kit lubricentro
                  </button>
                  <button type="button" className="action-button" onClick={agregarParte}>
                    <Plus size={17} /> Agregar repuesto
                  </button>
                </div>
              </div>

              {partesForm.length === 0 && <div className="empty">No agregaste repuestos.</div>}

              {partesForm.map((parte, indice) => (
                <div className="panel" key={indice}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                    <h4>Repuesto {indice + 1}</h4>
                    <button type="button" className="action-button" onClick={() => eliminarParte(indice)}><X size={17} /></button>
                  </div>
                  <div className="form-grid">
                    <div className="form-field">
                      <label>Repuesto</label>
                      <input value={parte.nombre} onChange={(e) => cambiarParte(indice,'nombre',e.target.value)} placeholder="Ej: Kit distribución" />
                    </div>
                    <div className="form-field">
                      <label>Marca</label>
                      <input value={parte.marca} onChange={(e) => cambiarParte(indice,'marca',e.target.value)} placeholder="Ej: SKF" />
                    </div>
                    <div className="form-field">
                      <label>Cantidad</label>
                      <input type="number" min="0.01" step="0.01" value={parte.cantidad} onChange={(e) => cambiarParte(indice,'cantidad',e.target.value)} />
                    </div>
                    <div className="form-field">
                      <label>Precio unitario</label>
                      <input type="number" min="0" step="0.01" value={parte.precio} onChange={(e) => cambiarParte(indice,'precio',e.target.value)} placeholder="$" />
                    </div>
                    <div className="form-field">
                      <label>Total</label>
                      <input type="text" readOnly value={formatoImporte(Number(parte.precio || 0) * Number(parte.cantidad || 1))} />
                    </div>
                  </div>
                </div>
              ))}

              <div className="panel" style={{marginTop:'15px'}}>
                <div style={{display:'flex',justifyContent:'space-between'}}><strong>Mano de obra</strong><strong>{formatoImporte(Number(formTrabajo.importe || 0))}</strong></div>
                <div style={{display:'flex',justifyContent:'space-between',marginTop:'8px'}}><strong>Repuestos</strong><strong>{formatoImporte(totalRepuestos(partesForm))}</strong></div>
                <div style={{display:'flex',justifyContent:'space-between',marginTop:'12px',fontSize:'22px'}}><strong>TOTAL</strong><strong>{formatoImporte(Number(formTrabajo.importe || 0) + totalRepuestos(partesForm))}</strong></div>
              </div>

              <button className="save-button" type="submit" disabled={guardando}>
                <Save size={18} />
                {guardando ? 'Guardando presupuesto...' : 'Guardar presupuesto'}
              </button>
            </form>
          </section>
        )}

        {/* DETALLE PRESUPUESTO */}

        {pantalla === 'presupuestoDetalle' && presupuestoSeleccionado && vehiculoSeleccionado && (
          <section className="panel">
            <button className="back" onClick={() => setPantalla('presupuestos')}>
              <ArrowLeft size={17} /> Volver a presupuestos
            </button>

            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:'15px',flexWrap:'wrap'}}>
              <div>
                <span className="vehicle-label">PRESUPUESTO PENDIENTE</span>
                <h2>{tipoPresupuesto(presupuestoSeleccionado)}</h2>
                <p>{vehiculoSeleccionado.patente} — {vehiculoSeleccionado.marca} {vehiculoSeleccionado.modelo}</p>
              </div>
              <strong>{formatoFecha(presupuestoSeleccionado.fecha)}</strong>
            </div>

            <div className="vehicle-detail-grid">
              <div className="detail-item"><span>Cliente</span><strong>{clienteSeleccionado?.nombre || '-'}</strong></div>
              <div className="detail-item"><span>Kilometraje</span><strong>{presupuestoSeleccionado.kilometraje ? `${presupuestoSeleccionado.kilometraje} km` : '-'}</strong></div>
              <div className="detail-item"><span>Mano de obra</span><strong>{formatoImporte(Number(presupuestoSeleccionado.importe || 0))}</strong></div>
              <div className="detail-item"><span>Total</span><strong>{formatoImporte(Number(presupuestoSeleccionado.importe || 0) + totalRepuestos(trabajoPartes))}</strong></div>
            </div>

            <div className="panel">
              <h3>Trabajo</h3>
              <p>{presupuestoSeleccionado.descripcion}</p>
              {presupuestoSeleccionado.observaciones && <p><strong>Observaciones:</strong> {presupuestoSeleccionado.observaciones}</p>}
            </div>

            <div className="panel">
              <h3>Repuestos</h3>
              {trabajoPartes.length === 0 && <div className="empty">No hay repuestos cargados.</div>}
              {trabajoPartes.map((parte) => (
                <div key={parte.id} className="vehicle-card" style={{marginBottom:'8px'}}>
                  <div><strong>{parte.nombre}</strong><p>{parte.marca || ''} {parte.cantidad ? `× ${parte.cantidad}` : ''}</p></div>
                  <strong>{formatoImporte(Number(parte.precio || 0) * Number(parte.cantidad || 1))}</strong>
                </div>
              ))}
            </div>

            <div className="vehicle-actions">
              <button className="action-button" onClick={imprimirPresupuesto}><Printer size={18} /> Imprimir</button>
              <button className="action-button" onClick={compartirPresupuestoWhatsApp}>Compartir por WhatsApp</button>
              <button className="save-button" onClick={convertirPresupuesto} disabled={guardando}><Wrench size={18} /> Convertir en trabajo</button>
              <button className="action-button" onClick={eliminarPresupuesto} disabled={guardando}><Trash2 size={18} /> Eliminar</button>
            </div>
          </section>
        )}

        {/* HISTORIAL */}

        {pantalla === 'historial' &&
          vehiculoSeleccionado && (
            <section className="panel">

              <button
                className="back"
                onClick={() =>
                  setPantalla('ficha')
                }
              >
                <ArrowLeft size={17} />
                Volver al vehículo
              </button>

              <div
                style={{
                  display:
                    'flex',
                  justifyContent:
                    'space-between',
                  alignItems:
                    'center',
                  gap: '15px',
                  flexWrap:
                    'wrap',
                }}
              >

                <div>

                  <span className="vehicle-label">
                    HISTORIAL
                  </span>

                  <h2>
                    {
                      vehiculoSeleccionado.patente
                    }
                  </h2>

                  <p>
                    {
                      vehiculoSeleccionado.marca
                    }{' '}
                    {
                      vehiculoSeleccionado.modelo
                    }
                  </p>

                </div>

                <button
                  className="action-button"
                  onClick={
                    imprimirHistorial
                  }
                >
                  <Printer size={18} />
                  Imprimir
                </button>

              </div>

              <div className="panel">

                <div className="vehicle-detail-grid">

                  <div className="detail-item">
                    <span>
                      Trabajos
                    </span>

                    <strong>
                      {
                        trabajosVehiculo.length
                      }
                    </strong>
                  </div>

                  <div className="detail-item">
                    <span>
                      Total histórico
                    </span>

                    <strong>
                      {
                        formatoImporte(
                          totalHistoricoVehiculo
                        )
                      }
                    </strong>
                  </div>

                  <div className="detail-item">
                    <span>
                      Kilometraje actual
                    </span>

                    <strong>
                      {
                        vehiculoSeleccionado.kilometraje ||
                        '-'
                      }{' '}
                      km
                    </strong>
                  </div>

                </div>

              </div>

              {cargando && (
                <div className="empty">
                  Cargando historial...
                </div>
              )}

              {!cargando &&
                trabajosVehiculo.length ===
                  0 && (
                  <div className="empty">
                    No hay trabajos registrados
                    para este vehículo.
                  </div>
                )}

              {!cargando &&
                trabajosVehiculo.map(
                  (trabajo) => (
                    <button
                      className="vehicle-card"
                      key={trabajo.id}
                      onClick={() =>
                        abrirTrabajo(
                          trabajo
                        )
                      }
                      style={{
                        width: '100%',
                        marginBottom:
                          '12px',
                      }}
                    >

                      <div>

                        <strong>
                          {
                            formatoFecha(
                              trabajo.fecha
                            )
                          }
                        </strong>

                        <p>
                          {
                            trabajo.tipo_trabajo ||
                            'Trabajo realizado'
                          }
                        </p>

                      </div>

                      <div>

                        <strong>
                          {
                            formatoImporte(
                              trabajo.importe
                            )
                          }
                        </strong>

                        <p>
                          {
                            trabajo.kilometraje
                              ? `${trabajo.kilometraje} km`
                              : ''
                          }
                        </p>

                      </div>

                      <ChevronRight
                        size={21}
                      />

                    </button>
                  )
                )}

            </section>
          )}

        {/* DETALLE TRABAJO */}

        {pantalla ===
          'trabajoDetalle' &&
          trabajoSeleccionado && (
            <section className="panel">

              <button
                className="back"
                onClick={() =>
                  setPantalla('historial')
                }
              >
                <ArrowLeft size={17} />
                Volver al historial
              </button>

              <span className="vehicle-label">
                TRABAJO REALIZADO
              </span>

              <h2>
                {
                  trabajoSeleccionado.tipo_trabajo ||
                  'Trabajo'
                }
              </h2>

              <p>
                {
                  formatoFecha(
                    trabajoSeleccionado.fecha
                  )
                }
              </p>

              <div className="vehicle-detail-grid">

                <div className="detail-item">
                  <span>
                    Fecha
                  </span>

                  <strong>
                    {
                      formatoFecha(
                        trabajoSeleccionado.fecha
                      )
                    }
                  </strong>
                </div>

                <div className="detail-item">
                  <span>
                    Kilometraje
                  </span>

                  <strong>
                    {
                      trabajoSeleccionado.kilometraje ||
                      '-'
                    }{' '}
                    km
                  </strong>
                </div>

                <div className="detail-item">
                  <span>
                    Importe
                  </span>

                  <strong>
                    {
                      formatoImporte(
                        trabajoSeleccionado.importe
                      )
                    }
                  </strong>
                </div>

              </div>

              <div className="panel">

                <h3>
                  Descripción
                </h3>

                <p>
                  {
                    trabajoSeleccionado.descripcion
                  }
                </p>

              </div>

              {trabajoSeleccionado.observaciones && (
                <div className="panel">

                  <h3>
                    Observaciones
                  </h3>

                  <p>
                    {
                      trabajoSeleccionado.observaciones
                    }
                  </p>

                </div>
              )}

              <div className="panel">

                <h3>
                  Repuestos utilizados
                </h3>

                {cargando && (
                  <p>
                    Cargando...
                  </p>
                )}

                {!cargando &&
                  trabajoPartes.length ===
                    0 && (
                    <div className="empty">
                      No se registraron
                      repuestos.
                    </div>
                  )}

                {trabajoPartes.map(
                  (parte) => (
                    <div
                      key={parte.id}
                      className="vehicle-card"
                      style={{
                        cursor:
                          'default',
                      }}
                    >

                      <div>

                        <strong>
                          {
                            parte.nombre
                          }
                        </strong>

                        <p>
                          {
                            parte.marca ||
                            'Marca no indicada'
                          }
                        </p>

                      </div>

                      <div>
                        Cant.:{' '}
                        {
                          parte.cantidad
                        }
                      </div>

                    </div>
                  )
                )}

              </div>

              {trabajoFotos.length > 0 && (
                <div className="panel">
                  <h3>Fotos del trabajo</h3>
                  <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(150px,1fr))', gap:'12px' }}>
                    {trabajoFotos.map((foto) => (
                      <button
                        key={foto.id}
                        type="button"
                        onClick={() => setFotoAmpliada(foto.foto_url)}
                        style={{ border: '0', padding: 0, background: 'transparent', cursor: 'zoom-in' }}
                      >
                        <img src={foto.foto_url} alt={foto.nombre_archivo || 'Foto del trabajo'} style={{ width:'100%', height:'110px', objectFit:'cover', borderRadius:'10px', display:'block' }} />
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="vehicle-actions">

                <button
                  className="action-button"
                  onClick={
                    editarTrabajo
                  }
                >
                  <Pencil size={18} />
                  Editar trabajo
                </button>

                <button className="action-button" onClick={imprimirComprobanteTrabajo}>
                  <FileText size={18} />
                  Comprobante
                </button>

                <button
                  className="action-button"
                  onClick={
                    eliminarTrabajo
                  }
                  disabled={guardando}
                >
                  <Trash2 size={18} />
                  Eliminar trabajo
                </button>

              </div>

            </section>
          )}

        {/* EDITAR TRABAJO */}

        {pantalla ===
          'editarTrabajo' &&
          trabajoSeleccionado && (
            <section className="panel">

              <button
                className="back"
                onClick={() =>
                  setPantalla(
                    'trabajoDetalle'
                  )
                }
              >
                <ArrowLeft size={17} />
                Volver
              </button>

              <h2>
                Editar trabajo
              </h2>

              <form
                className="vehicle-form"
                onSubmit={
                  actualizarTrabajo
                }
              >

                <div className="form-grid">

                  <div className="form-field">
                    <label>
                      Fecha
                    </label>

                    <input
                      type="date"
                      name="fecha"
                      value={
                        formTrabajo.fecha
                      }
                      onChange={
                        cambiarTrabajo
                      }
                    />
                  </div>

                  <div className="form-field">
                    <label>
                      Kilometraje
                    </label>

                    <input
                      type="number"
                      name="kilometraje"
                      value={
                        formTrabajo.kilometraje
                      }
                      onChange={
                        cambiarTrabajo
                      }
                    />
                  </div>

                  <div className="form-field">
                    <label>
                      Tipo de trabajo
                    </label>

                    <input
                      name="tipo_trabajo"
                      value={
                        formTrabajo.tipo_trabajo
                      }
                      onChange={
                        cambiarTrabajo
                      }
                    />
                  </div>

                  <div className="form-field">
                    <label>
                      Mano de obra
                    </label>

                    <input
                      type="number"
                      name="importe"
                      value={
                        formTrabajo.importe
                      }
                      onChange={
                        cambiarTrabajo
                      }
                    />
                  </div>


                  <div className="form-field">
                    <label>Importe total</label>
                    <input
                      type="text"
                      value={formatoImporte(Number(formTrabajo.importe || 0) + totalRepuestos(partesForm))}
                      readOnly
                    />
                  </div>

                </div>

                <div className="form-field">

                  <label>
                    Descripción
                  </label>

                  <textarea
                    name="descripcion"
                    value={
                      formTrabajo.descripcion
                    }
                    onChange={
                      cambiarTrabajo
                    }
                    rows="5"
                    required
                  />

                </div>

                <div className="form-field">

                  <label>
                    Observaciones
                  </label>

                  <textarea
                    name="observaciones"
                    value={
                      formTrabajo.observaciones
                    }
                    onChange={
                      cambiarTrabajo
                    }
                    rows="3"
                  />

                </div>

                <h3>
                  Repuestos
                </h3>

                {partesForm.map(
                  (parte, indice) => (
                    <div
                      className="panel"
                      key={indice}
                    >

                      <div className="form-grid">

                        <div className="form-field">
                          <label>
                            Repuesto
                          </label>

                          <input
                            value={
                              parte.nombre
                            }
                            onChange={(e) =>
                              cambiarParte(
                                indice,
                                'nombre',
                                e.target.value
                              )
                            }
                          />
                        </div>

                        <div className="form-field">
                          <label>
                            Marca
                          </label>

                          <input
                            value={
                              parte.marca
                            }
                            onChange={(e) =>
                              cambiarParte(
                                indice,
                                'marca',
                                e.target.value
                              )
                            }
                          />
                        </div>

                        <div className="form-field">
                          <label>
                            Cantidad
                          </label>

                          <input
                            type="number"
                            value={
                              parte.cantidad
                            }
                            onChange={(e) =>
                              cambiarParte(
                                indice,
                                'cantidad',
                                e.target.value
                              )
                            }
                          />
                        </div>

                        <div className="form-field">
                          <label>Precio unitario</label>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={parte.precio}
                            onChange={(e) =>
                              cambiarParte(indice, 'precio', e.target.value)
                            }
                            placeholder="$"
                          />
                        </div>

                      </div>

                      <button
                        type="button"
                        className="action-button"
                        onClick={() =>
                          eliminarParte(
                            indice
                          )
                        }
                      >
                        <Trash2 size={17} />
                        Eliminar
                      </button>

                    </div>
                  )
                )}

                <button
                  type="button"
                  className="action-button"
                  onClick={
                    agregarParte
                  }
                >
                  <Plus size={17} />
                  Agregar repuesto
                </button>

                <button
                  className="save-button"
                  type="submit"
                  disabled={guardando}
                >
                  <Save size={18} />

                  {guardando
                    ? 'Guardando...'
                    : 'Guardar cambios'}
                </button>

              </form>

            </section>
          )}

        {/* CLIENTES */}

        {pantalla === 'clientes' && (
          <section className="panel">

            <button
              className="back"
              onClick={irInicio}
            >
              <ArrowLeft size={17} />
              Volver
            </button>

            <div
              style={{
                display:
                  'flex',
                justifyContent:
                  'space-between',
                alignItems:
                  'center',
                gap: '15px',
                flexWrap:
                  'wrap',
              }}
            >

              <div>

                <h2>
                  Clientes
                </h2>

                <p>
                  Administrá tus clientes y
                  sus vehículos.
                </p>

              </div>

              <button
                className="save-button"
                onClick={nuevoCliente}
              >
                <UserPlus size={18} />
                Nuevo cliente + vehículo
              </button>

            </div>

            <div className="search-box">

              <Search size={19} />

              <input
                type="text"
                value={
                  busquedaCliente
                }
                onChange={(e) =>
                  setBusquedaCliente(
                    e.target.value
                  )
                }
                placeholder="Buscar cliente por nombre, teléfono, email o dirección..."
              />

            </div>

            {clientesFiltrados.length ===
              0 && (
              <div className="empty">
                No hay clientes
                registrados.
              </div>
            )}

            <div className="vehicle-list">

              {clientesFiltrados.map(
                (cliente) => {

                  const cantidad =
                    obtenerVehiculosCliente(
                      cliente.id
                    ).length

                  return (
                    <button
                      key={cliente.id}
                      className="vehicle-card"
                      onClick={() =>
                        abrirCliente(
                          cliente
                        )
                      }
                    >

                      <div>

                        <strong>
                          {
                            cliente.nombre
                          }
                        </strong>

                        <p>
                          {
                            cliente.telefono ||
                            'Sin teléfono'
                          }
                        </p>

                      </div>

                      <div>
                        {cantidad}{' '}
                        vehículo
                        {cantidad !==
                        1
                          ? 's'
                          : ''}
                      </div>

                      <ChevronRight
                        size={21}
                      />

                    </button>
                  )
                }
              )}

            </div>

          </section>
        )}

        {/* DETALLE CLIENTE */}

        {pantalla ===
          'clienteDetalle' &&
          clienteSeleccionado && (
            <section className="panel">

              <button
                className="back"
                onClick={irClientes}
              >
                <ArrowLeft size={17} />
                Volver a clientes
              </button>

              <span className="vehicle-label">
                CLIENTE
              </span>

              <h2>
                {
                  clienteSeleccionado.nombre
                }
              </h2>

              <div className="vehicle-detail-grid">

                <div className="detail-item">
                  <span>
                    Teléfono
                  </span>

                  <strong>
                    {
                      clienteSeleccionado.telefono ||
                      '-'
                    }
                  </strong>
                </div>

                <div className="detail-item">
                  <span>
                    Email
                  </span>

                  <strong>
                    {
                      clienteSeleccionado.email ||
                      '-'
                    }
                  </strong>
                </div>

                <div className="detail-item">
                  <span>
                    Dirección
                  </span>

                  <strong>
                    {
                      clienteSeleccionado.direccion ||
                      '-'
                    }
                  </strong>
                </div>

              </div>

              <div className="vehicle-actions">

                <button
                  className="action-button"
                  onClick={
                    editarCliente
                  }
                >
                  <Pencil size={18} />
                  Editar cliente
                </button>

                <button
                  className="action-button"
                  onClick={() =>
                    nuevoVehiculoParaCliente(
                      clienteSeleccionado
                    )
                  }
                >
                  <Plus size={18} />
                  Agregar vehículo
                </button>


                <button className="action-button" onClick={eliminarCliente} disabled={guardando}>
                  <Trash2 size={18} />
                  Eliminar cliente
                </button>
              </div>

              <div className="panel">

                <h3>
                  Vehículos del cliente
                </h3>

                {obtenerVehiculosCliente(
                  clienteSeleccionado.id
                ).length === 0 && (
                  <div className="empty">
                    Este cliente todavía no
                    tiene vehículos.
                  </div>
                )}

                {obtenerVehiculosCliente(
                  clienteSeleccionado.id
                ).map((vehiculo) => (
                  <button
                    key={vehiculo.id}
                    className="vehicle-card"
                    onClick={() =>
                      abrirVehiculo(
                        vehiculo
                      )
                    }
                  >

                    <div>

                      <strong>
                        {
                          vehiculo.patente
                        }
                      </strong>

                      <p>
                        {
                          vehiculo.marca
                        }{' '}
                        {
                          vehiculo.modelo
                        }
                      </p>

                    </div>

                    <div>
                      {
                        vehiculo.kilometraje ||
                        '-'
                      }{' '}
                      km
                    </div>

                    <ChevronRight
                      size={20}
                    />

                  </button>
                ))}

              </div>

            </section>
          )}

        {/* EDITAR CLIENTE */}

        {pantalla ===
          'editarCliente' &&
          clienteSeleccionado && (
            <section className="panel">

              <button
                className="back"
                onClick={() =>
                  setPantalla(
                    'clienteDetalle'
                  )
                }
              >
                <ArrowLeft size={17} />
                Volver
              </button>

              <h2>
                Editar cliente
              </h2>

              <form
                className="vehicle-form"
                onSubmit={
                  actualizarCliente
                }
              >

                <div className="form-grid">

                  <div className="form-field">
                    <label>
                      Nombre *
                    </label>

                    <input
                      name="nombre"
                      value={
                        formCliente.nombre
                      }
                      onChange={
                        cambiarCliente
                      }
                      required
                    />
                  </div>

                  <div className="form-field">
                    <label>
                      Teléfono
                    </label>

                    <input
                      name="telefono"
                      value={
                        formCliente.telefono
                      }
                      onChange={
                        cambiarCliente
                      }
                    />
                  </div>

                  <div className="form-field">
                    <label>
                      Email
                    </label>

                    <input
                      type="email"
                      name="email"
                      value={
                        formCliente.email
                      }
                      onChange={
                        cambiarCliente
                      }
                    />
                  </div>

                  <div className="form-field">
                    <label>
                      Dirección
                    </label>

                    <input
                      name="direccion"
                      value={
                        formCliente.direccion
                      }
                      onChange={
                        cambiarCliente
                      }
                    />
                  </div>

                </div>

                <div className="form-field">

                  <label>
                    Observaciones
                  </label>

                  <textarea
                    name="observaciones"
                    value={
                      formCliente.observaciones
                    }
                    onChange={
                      cambiarCliente
                    }
                    rows="4"
                  />

                </div>

                <button
                  className="save-button"
                  type="submit"
                  disabled={guardando}
                >

                  <Save size={18} />

                  {guardando
                    ? 'Guardando...'
                    : 'Guardar cambios'}

                </button>

              </form>

            </section>
          )}

      </main>

      {mostrarMantenimiento && vehiculoSeleccionado && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.55)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', padding:'20px' }}>
          <section className="panel" style={{ width:'min(760px,100%)', maxHeight:'90vh', overflowY:'auto' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:'15px' }}>
              <div><span className="vehicle-label">MANTENIMIENTO</span><h2>Programar próximo service</h2><p>{vehiculoSeleccionado.patente} — {vehiculoSeleccionado.marca} {vehiculoSeleccionado.modelo}</p></div>
              <button className="action-button" type="button" onClick={() => setMostrarMantenimiento(false)}><X size={18} /></button>
            </div>
            <form className="vehicle-form" onSubmit={guardarMantenimiento}>
              <div className="form-grid">
                <div className="form-field"><label>Mantenimiento</label><select name="tipo" value={formMantenimiento.tipo} onChange={cambiarMantenimiento}>
                  <option>Cambio de aceite y filtros</option><option>Service general</option><option>Distribución</option><option>Frenos</option><option>Refrigerante</option><option>Correa auxiliar</option><option>Bujías</option><option>Filtros</option><option>Otro mantenimiento</option>
                </select></div>
                <div className="form-field"><label>Fecha del último service</label><input type="date" name="fechaUltimo" value={formMantenimiento.fechaUltimo} onChange={cambiarMantenimiento} /></div>
                <div className="form-field"><label>Km del último service</label><input type="number" min="0" name="kmUltimo" value={formMantenimiento.kmUltimo} onChange={cambiarMantenimiento} placeholder="Ej: 150000" /></div>
                <div className="form-field"><label>Próximo kilometraje</label><input type="number" min="0" name="kmProximo" value={formMantenimiento.kmProximo} onChange={cambiarMantenimiento} placeholder="Ej: 160000" /></div>
                <div className="form-field"><label>Próxima fecha</label><input type="date" name="fechaProxima" value={formMantenimiento.fechaProxima} onChange={cambiarMantenimiento} /></div>
              </div>
              <div className="form-field"><label>Notas</label><textarea name="notas" value={formMantenimiento.notas} onChange={cambiarMantenimiento} rows="3" placeholder="Ej: aceite 5W30, filtro de aceite y filtro de aire." /></div>
              <p style={{ fontSize:'13px' }}>Podés usar kilometraje, fecha o ambos. El recordatorio queda guardado en la ficha y también se muestra al cliente mediante el QR.</p>
              <button className="save-button" type="submit" disabled={guardando}><Save size={18} /> {guardando ? 'Guardando...' : 'Guardar próximo service'}</button>
            </form>
          </section>
        </div>
      )}

      {/* MODAL QR */}

      {mostrarQR &&
        vehiculoSeleccionado && (
          <div
            style={{
              position:
                'fixed',
              inset: 0,
              background:
                'rgba(0,0,0,.7)',
              display:
                'flex',
              alignItems:
                'center',
              justifyContent:
                'center',
              padding: '20px',
              zIndex: 1000,
            }}
          >

            <div
              className="panel"
              style={{
                maxWidth:
                  '500px',
                width: '100%',
                textAlign:
                  'center',
              }}
            >

              <button
                className="back"
                onClick={() =>
                  setMostrarQR(
                    false
                  )
                }
              >
                <X size={17} />
                Cerrar
              </button>

              <QrCode
                size={40}
              />

              <h2>
                QR del vehículo
              </h2>

              <p>
                {
                  vehiculoSeleccionado.marca
                }{' '}
                {
                  vehiculoSeleccionado.modelo
                }
                <br />
                <strong>
                  {
                    vehiculoSeleccionado.patente
                  }
                </strong>
              </p>

              <div
                style={{
                  background:
                    '#fff',
                  padding:
                    '20px',
                  display:
                    'inline-block',
                  borderRadius:
                    '12px',
                  margin:
                    '15px 0',
                }}
              >

                <div data-qr-vehiculo>
                  <QRCodeCanvas
                    value={urlPublicaVehiculo(vehiculoSeleccionado)}
                    size={300}
                    level="H"
                    includeMargin
                  />
                </div>

              </div>

              <p>
                El cliente puede escanear
                este código para consultar
                el historial del vehículo.
              </p>

              <button
                className="save-button"
                onClick={() => {

                  const ventana =
                    window.open(
                      '',
                      '_blank',
                      'width=700,height=800'
                    )

                  if (!ventana)
                    return

                  ventana.document.write(`
                    <!DOCTYPE html>
                    <html>
                    <head>
                      <title>QR - ${
                        vehiculoSeleccionado.patente
                      }</title>

                      <style>
                        body {
                          font-family: Arial;
                          text-align: center;
                          padding: 40px;
                        }

                        img {
                          width: 350px;
                          height: 350px;
                        }

                        h1 {
                          margin-bottom: 5px;
                        }
                      </style>
                    </head>

                    <body>

                      <h1>EL CHINO</h1>

                      <h2>
                        Historial del vehículo
                      </h2>

                      <h3>
                        ${
                          vehiculoSeleccionado.marca
                        }
                        ${
                          vehiculoSeleccionado.modelo
                        }
                      </h3>

                      <h2>
                        ${
                          vehiculoSeleccionado.patente
                        }
                      </h2>

                      <img src="${dataUrl}" alt="QR del vehículo" />

                      <p>
                        Escaneá el código para consultar
                        el historial del vehículo.
                      </p>

                    </body>
                    </html>
                  `)

                  ventana.document.close()
                  ventana.focus()
                  ventana.print()
                }}
              >

                <Printer size={18} />
                Imprimir QR

              </button>

            </div>

          </div>
        )}

      {fotoAmpliada && (
        <div
          onClick={() => setFotoAmpliada(null)}
          style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.82)', zIndex:9999, display:'flex', alignItems:'center', justifyContent:'center', padding:'20px', cursor:'zoom-out' }}
        >
          <img src={fotoAmpliada} alt="Foto ampliada" style={{ maxWidth:'95vw', maxHeight:'90vh', objectFit:'contain', borderRadius:'10px' }} />
        </div>
      )}

    </div>
  )
}

export default App