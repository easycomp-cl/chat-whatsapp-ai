import os

import boto3


def handler(event, context):
    cluster = os.environ["ECS_CLUSTER"]
    service = os.environ["ECS_SERVICE"]

    ecs = boto3.client("ecs")
    result = ecs.update_service(cluster=cluster, service=service, desiredCount=0)

    desired = result["service"]["desiredCount"]
    running = result["service"]["runningCount"]

    print(f"ECS stop: cluster={cluster} service={service} desired={desired} running={running}")

    return {
        "ok": True,
        "cluster": cluster,
        "service": service,
        "desiredCount": desired,
        "runningCount": running,
    }
