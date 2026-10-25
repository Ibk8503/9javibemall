import React from 'react'
import { Body, Button, Container, Head, Heading, Html, Preview, Text } from '@react-email/components'
import type { TemplateEntry } from './registry'
import { main, container, brand, h1, text, label, value, button, footer, APP_URL } from './_brand'

interface Props { riderName?: string; orderRef?: string; pickup?: string; dropoff?: string }

const DeliveryAssigned = ({ riderName, orderRef, pickup, dropoff }: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>{`You've been assigned order ${orderRef ?? ''}`}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Text style={brand}>9jaVibeMall Partner Hub</Text>
        <Heading style={h1}>{riderName ? `${riderName}, you have a new delivery` : 'You have a new delivery'}</Heading>
        <Text style={text}>A delivery has been assigned to you. Open My Deliveries to start it.</Text>
        <Text style={label}>Order</Text><Text style={value}>{orderRef ?? '—'}</Text>
        <Text style={label}>Pick-up</Text><Text style={value}>{pickup ?? '—'}</Text>
        <Text style={label}>Drop-off</Text><Text style={value}>{dropoff ?? '—'}</Text>
        <Button style={button} href={`${APP_URL}/rider`}>Open Rider App</Button>
        <Text style={footer}>9jaVibeMall Logistics · support@9javibemall.com.ng</Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: DeliveryAssigned,
  subject: (d: Record<string, any>) => `New delivery assigned: ${d['orderRef'] ?? ''}`,
  displayName: 'Delivery assigned',
  previewData: { riderName: 'Tunde', orderRef: 'VM-10234', pickup: '12 Allen Ave, Ikeja', dropoff: '5 Adeola Odeku, Victoria Island' },
} satisfies TemplateEntry
