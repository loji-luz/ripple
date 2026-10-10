# Builds the API for Railway. Build context is the api/ folder.
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src
COPY src/Ripple.Domain/Ripple.Domain.csproj src/Ripple.Domain/
COPY src/Ripple.Data/Ripple.Data.csproj src/Ripple.Data/
COPY src/Ripple.Api/Ripple.Api.csproj src/Ripple.Api/
RUN dotnet restore src/Ripple.Api/Ripple.Api.csproj
COPY src/ src/
RUN dotnet publish src/Ripple.Api/Ripple.Api.csproj -c Release -o /app --no-restore

FROM mcr.microsoft.com/dotnet/aspnet:10.0
WORKDIR /app
COPY --from=build /app .
ENV ASPNETCORE_ENVIRONMENT=Production
# Railway provides PORT; listen on it, or on 8080 when run by hand.
CMD ["sh", "-c", "ASPNETCORE_URLS=http://0.0.0.0:${PORT:-8080} dotnet Ripple.Api.dll"]
