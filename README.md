# guarded-routes-next

`guarded-routes-next` is a package for managing route guards in Next.js applications.
It was born out of identifying there is a code duplication between checking if a tab exists and blocking/allowing
its relevant route.

It allows you to define role-based, feature-flagged, special-check routes, or any other check you can think of 
and provides middleware to enforce these guards.

It's intended to be used as an infrastructure that enables you to make the same checks in your middleware and your tabs seamlessly

After configuring, you get 2 artifacts 
- isPathAllowed function that is used both in the tabs and in the middle ware, 
- the middleware itself - guardMiddleware

This infra is scalable and flexible and is production ready.
Keep in mind that limitations of Next.js still apply (for example, the middleware in Next.js run in an Edge runtime context)

## Installation

To install the package, run:

```bash
yarn add guarded-routes-next
```

or

```bash
npm install guarded-routes-next
```

## Usage

### Define Guarded Routes

Create a `types.ts` file to define the structure of your guarded routes:

```typescript
// src/guarded-routes/types.ts
export interface GuardedRoutes {
  featureFlaggedRoutes: Record<string, string[]>;
  roleBasedRoutes: Record<string, any[]>;
  specialChecksRoutes?: Record<string, () => Promise<boolean>>;
  defaultRedirects?: Record<
    string,
    (pathname: string, searchParams: URLSearchParams) => Promise<string>
  >;
}
```

### Implement Middleware and checks

Create a `guardMiddleware.ts` file to implement the middleware logic:

```typescript
// src/guarded-routes/guardMiddleware.ts
import { NextRequest, NextResponse } from 'next/server';
import { getFlags } from '@/app/server-actions';
import { generateGuardedRoutes, GetApplicationGuardedRoutesFunc, searchMapForRoute } from 'guarded-routes-next';
import { GuardedRoutes } from '@/guarded-routes/types';
import { safePageGuardedRoutes } from '@/app/safe-page/guardedRoutes';

// this is an example of using a function to check for roles
const checkRouteForRole = (getApplicationGuardedRoutes: GetApplicationGuardedRoutesFunc<GuardedRoutes>) => async (pathname: string) => {
  const { roleBasedRoutes } = getApplicationGuardedRoutes();
  const roles: string[] | undefined = searchMapForRoute(pathname, roleBasedRoutes);
  if (!roles) return true;
  return !roles.includes('admin');
};

// this is an example of using a function to check for feature flags
const checkRouteForFeatureFlag = (getApplicationGuardedRoutes: GetApplicationGuardedRoutesFunc<GuardedRoutes>) => async (pathname: string) => {
  const { featureFlaggedRoutes } = getApplicationGuardedRoutes();
  const featureFlags: string[] | undefined = searchMapForRoute(pathname, featureFlaggedRoutes);
  if (!featureFlags) return true;
  return await getFlags(featureFlags);
};

// this is an example of using a function to check for custom special conditions
const checkRouteForSpecialChecks = (getApplicationGuardedRoutes: GetApplicationGuardedRoutesFunc<GuardedRoutes>) => async (pathname: string) => {
  const { specialChecksRoutes } = getApplicationGuardedRoutes();
  const relevantRouteValues = searchMapForRoute(pathname, specialChecksRoutes!);
  if (!relevantRouteValues) return true;
  return relevantRouteValues();
};

// here you define how the middleware should  behave when a route is rejected (isPathAllowed returns false)
const middlewareReject = (getApplicationGuardedRoutes: GetApplicationGuardedRoutesFunc<GuardedRoutes>) => async (request: NextRequest) => {
  const { nextUrl } = request;
  const { host, protocol, pathname, searchParams } = nextUrl;
  const defaultRedirect = searchMapForRoute(pathname, getApplicationGuardedRoutes().defaultRedirects!);
  const targetRedirect = defaultRedirect && (await defaultRedirect(pathname, searchParams));
  return targetRedirect
    ? NextResponse.redirect(`${protocol}${host}${targetRedirect}`)
    : NextResponse.error('not found', { status: 404 });
};

// this function gets the application guarded routes from the generateGuardedRoutes function
// it will result in the isPathAllowed function being able to check the route against the guarded routes
const isPathAllowedWithGetApplicationGuardedRoutes = (getApplicationGuardedRoutes: GetApplicationGuardedRoutesFunc<GuardedRoutes>) => async (pathname: string) => {
  return (
    (await checkRouteForRole(getApplicationGuardedRoutes)(pathname)) &&
    (await checkRouteForFeatureFlag(getApplicationGuardedRoutes)(pathname)) &&
    (await checkRouteForSpecialChecks(getApplicationGuardedRoutes)(pathname))
  );
};

const { isPathAllowed, guardMiddleware } = generateGuardedRoutes({
  isPathAllowedWithGetApplicationGuardedRoutes,
  initValue: {
    roleBasedRoutes: {},
    specialChecksRoutes: {},
    featureFlaggedRoutes: {}
  } as GuardedRoutes,
  applicationGuardedRoutes: [safePageGuardedRoutes],
  middlewareReject
});

export { guardMiddleware, isPathAllowed };
```

### Configure Middleware in Next.js

In your `middleware.ts` file, configure the middleware:

```typescript
// middleware.ts
import { guardMiddleware } from '@/guarded-routes/guardMiddleware';

export function middleware(request: NextRequest) {
  return guardMiddleware(request); // you can add other middlewares here
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)']
};
```

### Example Usage

Define your guarded routes in a separate file, one for each layout or feature:

```typescript
// src/app/safe-page/guardedRoutes.ts
import { GuardedRoutes } from '@/guarded-routes/types';

export const safePageGuardedRoutes: GuardedRoutes = {
  roleBasedRoutes: {
    '/admin-only-route': ['admin']
  },
  featureFlaggedRoutes: {
    '/beta-route': ['betaFeature']
  },
  specialChecksRoutes: {
    '/special-route': async () => {
      // Custom check logic
      return true;
    }
  },
  defaultRedirects: { //this is an example of how to redirect to a default route in case of rejection
    '/beta-route': async (pathname, searchParams) => {
      // Custom redirect logic
      return '/login';
    }
  }
};
```

Finally, you can create a simple Tab RSC and use it as a wrapper for your client componentTab:

```tsx
// src/component/tabs/Tab.tsx
export async function Tab(props:TabProps) {
    if (!await isPathAllowed(props.path)) {
        return null;
    }
    return <ClientTab {...props} />;
}
```
This way you don't need any checks inline in your JSX and your tabs are "clean".

## License

This project is licensed under the MIT License.
