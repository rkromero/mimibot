import PedidoDetail from '@/components/crm/pedidos/PedidoDetail'

type Props = { params: Promise<{ id: string }> }

export default async function PedidoDetailPage({ params }: Props) {
  const { id } = await params
  return <PedidoDetail id={id} />
}
