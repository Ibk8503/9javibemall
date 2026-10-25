import React from 'react'
import { Body, Button, Container, Head, Heading, Html, Preview, Text } from '@react-email/components'
import type { TemplateEntry } from './registry'
import { main, container, brand, h1, text, button, footer, APP_URL } from './_brand'

interface Props { name?: string; partnerName?: string; role?: string }

const Welcome = ({ name, partnerName, role }: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Welcome to 9jaVibeMall Partner Hub</Preview>
    <Body style={main}>
      <Container style={container}>
        <Text style={brand}>9jaVibeMall Partner Hub</Text>
        <Heading style={h1}>{name ? `Welcome, ${name}!` : 'Welcome aboard!'}</Heading>
        <Text style={text}>
          {partnerName
            ? `You're now part of ${partnerName}${role ? ` as ${role}` : ''}.`
            : 'Your logistics workspace is ready.'}{' '}
          Track orders, assign riders and follow every delivery live from your dashboard.
        </Text>
        <Button style={button} href={`${APP_URL}${role === 'rider' ? '/rider' : '/dashboard'}`}>{role === 'rider' ? 'Open Rider App' : 'Open dashboard'}</Button>
        <Text style={footer}>Need help? support@9javibemall.com.ng</Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: Welcome,
  subject: 'Welcome to 9jaVibeMall Partner Hub',
  displayName: 'Welcome',
  previewData: { name: 'Ada', partnerName: 'AAB Logistics', role: 'manager' },
} satisfies TemplateEntry
