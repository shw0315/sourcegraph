import { concat, Observable } from 'rxjs'
import { map, mergeMap } from 'rxjs/operators'
import { gql } from '../../../shared/src/graphql/graphql'
import * as GQL from '../../../shared/src/graphql/schema'
import { createAggregateError } from '../../../shared/src/util/errors'
import { refreshAuthenticatedUser } from '../auth'
import { mutateGraphQL } from '../backend/graphql'
import { eventLogger } from '../tracking/eventLogger'

/**
 * Sends a GraphQL mutation to create an organization and returns an Observable that emits the new organization,
 * then completes.
 */
export function createOrganization(args: {
    /** The name of the organization. */
    name: string
    /** The new organization's display name (e.g. full name) in the organization profile. */
    displayName?: string
}): Observable<GQL.IOrg> {
    return mutateGraphQL(
        gql`
            mutation createOrganization($name: String!, $displayName: String) {
                createOrganization(name: $name, displayName: $displayName) {
                    id
                    name
                }
            }
        `,
        args
    ).pipe(
        mergeMap(({ data, errors }) => {
            if (!data || !data.createOrganization) {
                eventLogger.log('NewOrgFailed')
                throw createAggregateError(errors)
            }
            eventLogger.log('NewOrgCreated', {
                organization: {
                    org_id: data.createOrganization.id,
                    org_name: data.createOrganization.name,
                },
            })
            return concat(refreshAuthenticatedUser(), [data.createOrganization])
        })
    )
}

/**
 * Sends a GraphQL mutation to remove a user from an organization.
 *
 * @return An Observable that emits `undefined` when done, then completes
 */
export function removeUserFromOrganization(args: {
    /** The ID of the user to remove. */
    user: GQL.ID
    /** The organization's ID. */
    organization: GQL.ID
}): Observable<void> {
    return mutateGraphQL(
        gql`
            mutation removeUserFromOrganization($user: ID!, $organization: ID!) {
                removeUserFromOrganization(user: $user, organization: $organization) {
                    alwaysNil
                }
            }
        `,
        args
    ).pipe(
        mergeMap(({ data, errors }) => {
            const eventData = {
                organization: {
                    remove: {
                        user_id: args.user,
                    },
                    org_id: args.organization,
                },
            }
            if (errors && errors.length > 0) {
                eventLogger.log('RemoveOrgMemberFailed', eventData)
                throw createAggregateError(errors)
            }
            eventLogger.log('OrgMemberRemoved', eventData)
            // Reload user data
            return concat(refreshAuthenticatedUser(), [void 0])
        })
    )
}

/**
 * Sends a GraphQL mutation to update an organization.
 *
 * @param id The ID of the organization.
 * @param displayName The display name of the organization.
 * @return Observable that emits `undefined`, then completes
 */
export function updateOrganization(id: GQL.ID, displayName: string): Observable<void> {
    return mutateGraphQL(
        gql`
            mutation UpdateOrganization($id: ID!, $displayName: String) {
                updateOrganization(id: $id, displayName: $displayName) {
                    id
                }
            }
        `,
        {
            id,
            displayName,
        }
    ).pipe(
        map(({ data, errors }) => {
            const eventData = {
                organization: {
                    update: {
                        display_name: displayName,
                    },
                    org_id: id,
                },
            }
            if (!data || (errors && errors.length > 0)) {
                eventLogger.log('UpdateOrgSettingsFailed', eventData)
                throw createAggregateError(errors)
            }
            eventLogger.log('OrgSettingsUpdated', eventData)
            return
        })
    )
}
