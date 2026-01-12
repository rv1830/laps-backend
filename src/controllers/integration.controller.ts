import { Request, Response } from 'express';
import axios from 'axios';
import { prisma } from '../app';
import { AuthRequest } from '../middleware/auth.middleware';

const HUBSPOT_CLIENT_ID = process.env.HUBSPOT_CLIENT_ID;
const HUBSPOT_CLIENT_SECRET = process.env.HUBSPOT_CLIENT_SECRET;
const HUBSPOT_REDIRECT_URI = process.env.HUBSPOT_REDIRECT_URI;

export class IntegrationController {

    /**
     * Step 1: Redirect user to HubSpot Login Screen
     */
    async initiateHubSpotAuth(req: AuthRequest, res: Response) {
        try {
            const { workspaceId } = req;
            if (!workspaceId) return res.status(400).json({ error: 'Workspace ID missing' });

            // Scopes required for reading contacts, companies, and owners
            const scopes = 'crm.objects.contacts.read crm.objects.companies.read crm.objects.owners.read';
            
            // State mein workspaceId bhej rahe hain taaki callback par pehchan sakein
            const authUrl = `https://app.hubspot.com/oauth/authorize?client_id=${HUBSPOT_CLIENT_ID}&scope=${encodeURIComponent(scopes)}&redirect_uri=${encodeURIComponent(HUBSPOT_REDIRECT_URI!)}&state=${workspaceId}`;

            return res.json({ url: authUrl });
        } catch (error) {
            console.error('HubSpot Init Error:', error);
            return res.status(500).json({ error: 'Failed to initiate HubSpot auth' });
        }
    }

    /**
     * Step 2: Handle Callback (HubSpot redirects here with Code)
     */
    async handleHubSpotCallback(req: Request, res: Response) {
        const { code, state } = req.query; // 'state' humne workspaceId bheja tha
        const workspaceId = state as string;

        if (!code || !workspaceId) {
            return res.status(400).json({ error: 'Invalid callback parameters' });
        }

        try {
            // 1. Exchange Code for Tokens
            const tokenResponse = await axios.post(
                'https://api.hubapi.com/oauth/v1/token',
                new URLSearchParams({
                    grant_type: 'authorization_code',
                    client_id: HUBSPOT_CLIENT_ID!,
                    client_secret: HUBSPOT_CLIENT_SECRET!,
                    redirect_uri: HUBSPOT_REDIRECT_URI!,
                    code: code as string
                }),
                { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
            );

            const { access_token, refresh_token, expires_in } = tokenResponse.data;
            
            // Calculate expiry time (usually 30 mins)
            const expiresAt = new Date(Date.now() + expires_in * 1000);

            // 2. Save Tokens to Database (Integration Table)
            await prisma.integration.upsert({
                where: {
                    workspaceId_provider_type: { 
                        workspaceId,
                        provider: 'hubspot',
                        type: 'crm_import'
                    }
                },
                update: {
                    isActive: true,
                    credentials: {
                        accessToken: access_token,
                        refreshToken: refresh_token,
                        expiresAt: expiresAt.toISOString()
                    },
                    lastSyncAt: new Date()
                },
                create: {
                    workspaceId,
                    provider: 'hubspot',
                    type: 'crm_import',
                    isActive: true,
                    credentials: {
                        accessToken: access_token,
                        refreshToken: refresh_token,
                        expiresAt: expiresAt.toISOString()
                    },
                    lastSyncAt: new Date()
                }
            });

            // 3. Redirect to Frontend Settings Page (Fixed ENV & Fallback)
            const frontendBaseUrl = process.env.FRONTEND_URL || "https://laps-one.vercel.app";
            return res.redirect(`${frontendBaseUrl}/dashboard/${workspaceId}/integration?hubspot_connected=true`);

        } catch (error: any) {
            console.error('HubSpot Callback Error:', error.response?.data || error.message);
            return res.status(500).json({ error: 'Failed to connect HubSpot' });
        }
    }

    /**
     * Helper: Check Token Validity & Refresh if needed
     */
    private async getValidAccessToken(integration: any) {
        const creds = integration.credentials as any;
        const now = new Date();
        const expiry = new Date(creds.expiresAt);

        // Agar token abhi valid hai (5 min buffer ke saath), wahi return karo
        if (expiry > new Date(now.getTime() + 5 * 60000)) {
            return creds.accessToken;
        }

        console.log('Refreshing HubSpot Token...');

        // Refresh Logic
        const response = await axios.post(
            'https://api.hubapi.com/oauth/v1/token',
            new URLSearchParams({
                grant_type: 'refresh_token',
                client_id: HUBSPOT_CLIENT_ID!,
                client_secret: HUBSPOT_CLIENT_SECRET!,
                refresh_token: creds.refreshToken
            }),
            { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
        );

        const { access_token, refresh_token, expires_in } = response.data;
        const newExpiresAt = new Date(Date.now() + expires_in * 1000);

        // Update DB with new tokens
        await prisma.integration.update({
            where: { id: integration.id },
            data: {
                credentials: {
                    accessToken: access_token,
                    refreshToken: refresh_token,
                    expiresAt: newExpiresAt.toISOString()
                }
            }
        });

        return access_token;
    }

    /**
     * Step 3: Import Contacts Button Logic
     */
    async importHubSpotContacts(req: AuthRequest, res: Response) {
        try {
            const { workspaceId } = req;
            
            // 1. Get Integration Record
            const integration = await prisma.integration.findUnique({
                where: {
                    workspaceId_provider_type: {
                        workspaceId: workspaceId!,
                        provider: 'hubspot',
                        type: 'crm_import'
                    }
                }
            });

            if (!integration || !integration.isActive) {
                return res.status(400).json({ error: 'HubSpot is not connected' });
            }

            // 2. Get Valid Token (Refresh if expired)
            const accessToken = await this.getValidAccessToken(integration);

            // 3. Get Default Stage (Leads ko rakhne ke liye)
            const defaultStage = await prisma.stage.findFirst({
                where: { workspaceId: workspaceId! },
                orderBy: { order: 'asc' }
            });

            if (!defaultStage) {
                return res.status(400).json({ error: 'No pipeline stage found. Please create a stage first.' });
            }

            // 4. Fetch Contacts from HubSpot API
            const hubRes = await axios.get('https://api.hubapi.com/crm/v3/objects/contacts', {
                headers: { Authorization: `Bearer ${accessToken}` },
                params: {
                    limit: 100,
                    properties: 'email,firstname,lastname,phone,jobtitle,company',
                    archived: false
                }
            });

            const contacts = hubRes.data.results;
            let count = 0;

            // 5. Map & Save to LAPS Leads Table
            for (const contact of contacts) {
                const props = contact.properties;
                
                if (!props.email) continue;

                const fullName = `${props.firstname || ''} ${props.lastname || ''}`.trim() || props.email;

                await prisma.lead.upsert({
                    where: {
                        workspaceId_email: {
                            workspaceId: workspaceId!,
                            email: props.email
                        }
                    },
                    update: {
                        firstName: props.firstname,
                        lastName: props.lastname,
                        phone: props.phone,
                        jobTitle: props.jobtitle,
                        company: props.company
                    },
                    create: {
                        workspaceId: workspaceId!, 
                        stageId: defaultStage.id,
                        email: props.email,
                        firstName: props.firstname,
                        lastName: props.lastname,
                        phone: props.phone,
                        jobTitle: props.jobtitle,
                        company: props.company,
                        fullName: fullName,
                        source: 'HubSpot Import',
                        ownerId: req.user!.id 
                    }
                });
                count++;
            }

            return res.json({ 
                success: true, 
                message: `Successfully imported ${count} leads from HubSpot` 
            });

        } catch (error: any) {
            console.error('HubSpot Import Error:', error.response?.data || error.message);
            return res.status(500).json({ error: 'HubSpot import failed' });
        }
    }
}