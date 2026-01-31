import {
  Html,
  Head,
  Preview,
  Body,
  Container,
  Heading,
  Text,
  Button,
  Hr,
  Section,
  Link,
} from '@react-email/components';
import type { GroupedDigestData } from '../services/digest-builder.service.js';
import { AlertRow } from './components/alert-row.js';

interface WeeklyDigestProps {
  userName: string;
  digest: GroupedDigestData;
  unsubscribeUrl: string;
  dashboardUrl: string;
}

export function WeeklyDigest({
  userName,
  digest,
  unsubscribeUrl,
  dashboardUrl,
}: WeeklyDigestProps) {
  const { sites, summary, organizationName } = digest;

  return (
    <Html>
      <Head />
      <Preview>
        Your weekly alert summary - {String(summary.total)} alert
        {summary.total !== 1 ? 's' : ''} in the last 7 days
      </Preview>
      <Body
        style={{
          backgroundColor: '#f4f4f4',
          fontFamily: 'Arial, sans-serif',
          padding: '20px 0',
        }}
      >
        <Container
          style={{
            backgroundColor: '#ffffff',
            maxWidth: '600px',
            margin: '0 auto',
            borderRadius: '8px',
            overflow: 'hidden',
            boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
          }}
        >
          {/* Header */}
          <Section
            style={{
              backgroundColor: '#6f42c1',
              padding: '24px',
              textAlign: 'center',
            }}
          >
            <Heading
              style={{
                margin: '0',
                color: '#ffffff',
                fontSize: '24px',
                fontWeight: 'bold',
              }}
            >
              Weekly Alert Digest
            </Heading>
            <Text
              style={{
                margin: '8px 0 0 0',
                color: '#e9d5ff',
                fontSize: '14px',
              }}
            >
              FreshTrack Pro
            </Text>
          </Section>

          {/* Greeting */}
          <Section style={{ padding: '24px' }}>
            <Text
              style={{
                margin: '0 0 16px 0',
                fontSize: '16px',
                color: '#212529',
              }}
            >
              Hi {userName},
            </Text>
            <Text
              style={{
                margin: '0 0 16px 0',
                fontSize: '14px',
                color: '#495057',
                lineHeight: '1.6',
              }}
            >
              Here's your weekly summary for <strong>{organizationName}</strong>:
            </Text>

            {/* Summary Stats */}
            <Section
              style={{
                backgroundColor: '#f8f9fa',
                padding: '16px',
                borderRadius: '6px',
                marginBottom: '24px',
              }}
            >
              <Text
                style={{
                  margin: '0',
                  fontSize: '14px',
                  color: '#495057',
                  textAlign: 'center',
                }}
              >
                <strong>{summary.total}</strong> alert
                {summary.total !== 1 ? 's' : ''} |{' '}
                <span style={{ color: '#dc3545' }}>
                  <strong>{summary.critical}</strong> critical
                </span>{' '}
                |{' '}
                <span style={{ color: '#ffc107' }}>
                  <strong>{summary.warning}</strong> warning
                </span>{' '}
                |{' '}
                <span style={{ color: '#28a745' }}>
                  <strong>{summary.resolved}</strong> resolved
                </span>
              </Text>
            </Section>

            {/* Alert List - Grouped by Site > Unit */}
            {sites.length > 0 ? (
              <>
                <Heading
                  as="h2"
                  style={{
                    margin: '0 0 12px 0',
                    fontSize: '18px',
                    color: '#212529',
                  }}
                >
                  Alerts by Location
                </Heading>

                {sites.map((site) => (
                  <Section
                    key={site.siteId}
                    style={{
                      marginBottom: '20px',
                    }}
                  >
                    {/* Site Header */}
                    <Heading
                      as="h3"
                      style={{
                        margin: '0 0 8px 0',
                        fontSize: '16px',
                        color: '#6f42c1',
                        borderBottom: '2px solid #6f42c1',
                        paddingBottom: '4px',
                      }}
                    >
                      {site.siteName}
                    </Heading>

                    {site.units.map((unit) => {
                      const displayAlerts = unit.alerts.slice(0, 5);
                      const hasMore = unit.alerts.length > 5;
                      const remainingCount = unit.alerts.length - 5;

                      return (
                        <Section
                          key={unit.unitId}
                          style={{
                            marginBottom: '12px',
                            marginLeft: '12px',
                          }}
                        >
                          {/* Unit Header */}
                          <Text
                            style={{
                              margin: '0 0 6px 0',
                              fontSize: '14px',
                              fontWeight: 'bold',
                              color: '#495057',
                            }}
                          >
                            {unit.unitName}
                          </Text>

                          {/* Unit Alerts */}
                          <Section
                            style={{
                              border: '1px solid #dee2e6',
                              borderRadius: '6px',
                              overflow: 'hidden',
                            }}
                          >
                            {displayAlerts.map((alert) => (
                              <AlertRow
                                key={alert.id}
                                severity={alert.severity}
                                message={alert.message || 'Alert triggered'}
                                unitName={alert.unitName}
                                siteName={alert.siteName}
                                triggeredAt={alert.triggeredAt}
                              />
                            ))}
                          </Section>

                          {hasMore && (
                            <Text
                              style={{
                                margin: '4px 0 0 0',
                                fontSize: '12px',
                                color: '#6c757d',
                              }}
                            >
                              + {remainingCount} more alert
                              {remainingCount !== 1 ? 's' : ''} from this unit
                            </Text>
                          )}
                        </Section>
                      );
                    })}
                  </Section>
                ))}

                {/* CTA Button */}
                <Section style={{ textAlign: 'center', margin: '24px 0' }}>
                  <Button
                    href={dashboardUrl}
                    style={{
                      backgroundColor: '#6f42c1',
                      color: '#ffffff',
                      padding: '12px 32px',
                      borderRadius: '6px',
                      textDecoration: 'none',
                      fontSize: '14px',
                      fontWeight: 'bold',
                      display: 'inline-block',
                    }}
                  >
                    View All Alerts
                  </Button>
                </Section>
              </>
            ) : (
              <Text
                style={{
                  margin: '0',
                  fontSize: '14px',
                  color: '#6c757d',
                  textAlign: 'center',
                  padding: '24px',
                }}
              >
                No alerts in the last 7 days. Great work!
              </Text>
            )}
          </Section>

          {/* Footer */}
          <Hr style={{ borderColor: '#dee2e6', margin: '0' }} />
          <Section
            style={{
              padding: '16px 24px',
              backgroundColor: '#f8f9fa',
            }}
          >
            <Text
              style={{
                margin: '0',
                fontSize: '12px',
                color: '#6c757d',
                textAlign: 'center',
                lineHeight: '1.5',
              }}
            >
              You're receiving this because you have email digest notifications enabled.
              <br />
              <Link
                href={unsubscribeUrl}
                style={{
                  color: '#6f42c1',
                  textDecoration: 'underline',
                }}
              >
                Unsubscribe from digest emails
              </Link>
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}
