import ClienteDetail from '@/components/crm/clientes/ClienteDetail'

type Props = { params: Promise<{ id: string }> }

export default async function ClienteDetailPage({ params }: Props) {
  const { id } = await params
  return <ClienteDetail id={id} />
}
