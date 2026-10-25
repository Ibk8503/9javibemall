import React from 'react'
import { Body, Button, Container, Head, Heading, Html, Preview, Text } from '@react-email/components'
import type { TemplateEntry } from './registry'
import { main, container, brand, h1, text, label, value, button, footer, APP_URL } from './_brand'

interface Props { orderRef?: string; pickup?: string; dropoff?: string; items?: string }

const OrderConfirmation = ({ orderRef, pickup, dropoff, items }: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>{`New order ${orderRef ?? ''} received`}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Text style={brand}>9jaVibeMall Partner Hub</Text>
        <Heading style={h1}>New order received</Heading>
        <Text style={text}>A new order has arrived on your dashboard and is waiting to be acknowledged.</Text>
        <Text style={label}>Order</Text><Text style={value}>{orderRef ?? '—'}</Text>
        <Text style={label}>Pick-up</Text><Text style={value}>{pickup ?? '—'}</Text>
        <Text style={label}>Drop-off</Text><Text style={value}>{dropoff ?? '—'}</Text>
        {items ? (<><Text style={label}>Items</Text><Text style={value}>{items}</Text></>) : null}
        <Button style={button} href={`${APP_URL}/incoming`}>View order</Button>
        <Text style={footer}>9jaVibeMall Logistics · support@9javibemall.com.ng</Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: OrderConfirmation,
  subject: (d: Record<string, any>) => `New order ${d['orderRef'] ?? ''} received`,
  displayName: 'Order confirmation',
  previewData: { orderRef: 'VM-10234', pickup: '12 Allen Ave, Ikeja', dropoff: '5 Adeola Odeku, Victoria Island', items: '2 × sneakers' },
} satisfies TemplateEntry
